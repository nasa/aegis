/**
 * Box API v2 download flow:
 * - `makeRequest` calls `/2.0/files/:id/content` so ranged responses expose status and headers.
 * - A `.part` file records completed bytes and resumes with `Range` after a stalled stream.
 * - The route validates `206` and `Content-Range`, then emits NDJSON progress while extracting.
 */
import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import { createHash } from "node:crypto";
import fs from "node:fs";
import type { Readable } from "node:stream";

import { BoxClient, BoxCcgAuth, CcgConfig } from "box-node-sdk";
import express from "express";

import { unzip } from "server/file/file";
import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();
const THIRTY_SECONDS_IN_MS = 30 * 1000;
const ONE_MIB_IN_BYTES = 1024 * 1024;
const BOX_DOWNLOAD_REQUEST_TIMEOUT_MS = THIRTY_SECONDS_IN_MS;
const BOX_DOWNLOAD_IDLE_TIMEOUT_MS = THIRTY_SECONDS_IN_MS;
const BOX_DOWNLOAD_STREAM_ATTEMPTS = 3;
const BOX_DOWNLOAD_RETRY_DELAY_MS = 1000;
const BOX_DOWNLOAD_CLIENT_PROGRESS_INTERVAL_BYTES = ONE_MIB_IN_BYTES;
const BOX_DOWNLOAD_PROGRESS_INTERVAL_BYTES = 10 * ONE_MIB_IN_BYTES;

type BoxDownloadProgress = {
  type: "progress";
  stage: "starting" | "downloading" | "extracting" | "moving" | "complete";
  fileName?: string;
  bytesDownloaded?: number;
  totalBytes?: number;
};

type BoxDownloadResponse =
  | BoxDownloadProgress
  | { status: "success"; message: string; data: { success: true } }
  | { status: "error"; message: string };

class BoxDownloadNotReadyError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number | undefined
  ) {
    super(message);
    this.name = "BoxDownloadNotReadyError";
  }
}

const parseQuery = (query: Query) => {
  const { missionId, itemId, path } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    itemId: itemId ? itemId.toString() : null,
    path: path ? path.toString() : null,
  };

  return queryObj;
};

// get boxDownloadFile
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const editPermission = hasPerms({
    missionId: queryObj.missionId,
    permission: "edit",
    appUser: req.session.appUser,
  });
  if (!editPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "file/boxDownloadFile",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: [queryObj.itemId],
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    const downloadFilePath = process.env.STATIC_DIR;
    if (!downloadFilePath) {
      throw new Error("STATIC_DIR is not configured");
    }

    // setup access to the Box.com SDK
    const auth = new BoxCcgAuth({
      config: new CcgConfig({
        clientId: process.env.BOX_CLIENT_ID,
        clientSecret: process.env.BOX_CLIENT_SECRET,
        enterpriseId: process.env.BOX_ENTERPRISE_ID,
        userId: process.env.BOX_USER_ID,
      }),
    });
    const client = new BoxClient({ auth }).withTimeouts({
      timeoutMs: BOX_DOWNLOAD_REQUEST_TIMEOUT_MS,
    });

    beginProgressResponse(res);
    writeProgress(res, { type: "progress", stage: "starting" });

    serverLogger.info({
      logId: "box-download",
      logValue: `Starting Box download for item ${queryObj.itemId}`,
    });

    // Get metadata first so the client can display byte progress.
    const metadata = await client.files.getFileById(queryObj.itemId);
    const totalBytes = metadata.size ?? undefined;
    writeProgress(res, {
      type: "progress",
      stage: "downloading",
      fileName: metadata.name,
      totalBytes,
      bytesDownloaded: 0,
    });
    serverLogger.info({
      logId: "box-download",
      logValue: `Box metadata received for ${metadata.name}: ${totalBytes ?? "unknown"} bytes`,
    });

    await downloadFileFromBox(
      client,
      queryObj.itemId,
      downloadFilePath + "/" + metadata.name,
      totalBytes,
      metadata.sha1,
      (bytesDownloaded) => {
        writeProgress(res, {
          type: "progress",
          stage: "downloading",
          fileName: metadata.name,
          bytesDownloaded,
          totalBytes,
        });
      }
    );

    const fileExtension = metadata.name.split(".").pop()?.toLowerCase();
    if (fileExtension === "zip") {
      writeProgress(res, { type: "progress", stage: "extracting", fileName: metadata.name });
      serverLogger.info({
        logId: "box-download",
        logValue: `Extracting downloaded zip ${metadata.name} to ${queryObj.path}`,
      });
      await unzip(metadata.name, queryObj.path);
    } else {
      writeProgress(res, { type: "progress", stage: "moving", fileName: metadata.name });
      if (!fs.existsSync(downloadFilePath + "/" + queryObj.path)) {
        fs.mkdirSync(downloadFilePath + "/" + queryObj.path, { recursive: true });
      }

      fs.renameSync(
        downloadFilePath + "/" + metadata.name,
        downloadFilePath + "/" + queryObj.path + "/" + metadata.name
      );
    }

    serverLogger.info({
      logId: "box-download",
      logValue: `Completed Box download and processing for ${metadata.name}`,
    });
    writeProgress(res, { type: "progress", stage: "complete", fileName: metadata.name });
    writeProgress(res, {
      status: "success",
      message: "File downloaded and processed",
      data: { success: true },
    });
    res.end();
  } catch (e) {
    const error = asError(e);
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "file/boxDownloadFile",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: [queryObj.itemId],
      message: error.message,
      error,
    });
    if (res.headersSent) {
      writeProgress(res, { status: "error", message: error.message });
      res.end();
      return;
    }
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;

async function downloadFileFromBox(
  client: BoxClient,
  itemId: string,
  downloadFilePath: string,
  totalBytes: number | undefined,
  expectedSha1: string | undefined,
  onProgress: (bytesDownloaded: number) => void
): Promise<void> {
  const partialFilePath = `${downloadFilePath}.part`;
  if (!fs.existsSync(partialFilePath) && fs.existsSync(downloadFilePath)) {
    fs.rmSync(downloadFilePath, { force: true });
  }

  let downloadedBytes = getFileSize(partialFilePath);
  if (totalBytes !== undefined && downloadedBytes > totalBytes) {
    fs.rmSync(partialFilePath, { force: true });
    downloadedBytes = 0;
  }
  if (totalBytes !== undefined && downloadedBytes === totalBytes) {
    if (!fs.existsSync(partialFilePath)) {
      fs.writeFileSync(partialFilePath, "");
    }
    const actualSha1 = expectedSha1 ? await getFileSha1(partialFilePath) : undefined;
    if (expectedSha1 && actualSha1 !== expectedSha1.toLowerCase()) {
      fs.rmSync(partialFilePath, { force: true });
      downloadedBytes = 0;
    } else {
      fs.renameSync(partialFilePath, downloadFilePath);
      onProgress(downloadedBytes);
      return;
    }
  }

  for (let attempt = 1; attempt <= BOX_DOWNLOAD_STREAM_ATTEMPTS; attempt++) {
    let retryDelayMs = attempt * BOX_DOWNLOAD_RETRY_DELAY_MS;
    try {
      downloadedBytes = getFileSize(partialFilePath);
      const response = await requestBoxDownload(client, itemId, downloadedBytes, totalBytes);
      const stream = response.content;

      await writeBoxDownloadToFile(
        stream,
        partialFilePath,
        itemId,
        downloadedBytes,
        totalBytes,
        onProgress
      );

      downloadedBytes = getFileSize(partialFilePath);
      if (totalBytes !== undefined && downloadedBytes !== totalBytes) {
        throw new Error(
          `Box download ended early for file ${itemId}: ${downloadedBytes}/${totalBytes} bytes`
        );
      }
      const actualSha1 = expectedSha1 ? await getFileSha1(partialFilePath) : undefined;
      if (expectedSha1 && actualSha1 !== expectedSha1.toLowerCase()) {
        fs.rmSync(partialFilePath, { force: true });
        throw new Error(`Box download checksum mismatch for file ${itemId}`);
      }

      fs.renameSync(partialFilePath, downloadFilePath);
      return;
    } catch (error) {
      const downloadError = asError(error);
      downloadedBytes = getFileSize(partialFilePath);
      if (error instanceof BoxDownloadNotReadyError && error.retryAfterMs !== undefined) {
        retryDelayMs = error.retryAfterMs;
      }

      if (attempt === BOX_DOWNLOAD_STREAM_ATTEMPTS) {
        throw downloadError;
      }

      serverLogger.warning({
        logId: "box-download",
        logValue: `Box download attempt ${attempt} failed for item ${itemId} at ${downloadedBytes} bytes: ${downloadError.message}. Retrying from that byte.`,
      });
      onProgress(downloadedBytes);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(`Box download failed for file ${itemId}`);
}

async function requestBoxDownload(
  client: BoxClient,
  itemId: string,
  startByte: number,
  totalBytes: number | undefined
): Promise<{ content: Readable }> {
  const requestUrl = `${client.networkSession.baseUrls.baseUrl}/2.0/files/${itemId}/content`;
  const response = await client.makeRequest({
    method: "GET",
    url: requestUrl,
    headers: startByte > 0 ? { range: `bytes=${startByte}-` } : {},
    responseFormat: "binary",
  });

  if (response.status === 202) {
    const retryAfterHeader = getResponseHeader(response.headers, "retry-after");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    const retryMessage = Number.isFinite(retryAfterSeconds)
      ? ` Retry-After=${retryAfterSeconds}s.`
      : "";
    const retryAfterMs = Number.isFinite(retryAfterSeconds)
      ? Math.max(1000, Math.ceil(retryAfterSeconds * 1000))
      : undefined;
    throw new BoxDownloadNotReadyError(
      `Box file ${itemId} is not ready for download.${retryMessage}`,
      retryAfterMs
    );
  }

  const expectedStatus = startByte > 0 ? 206 : 200;
  if (response.status !== expectedStatus) {
    throw new Error(
      `Box returned HTTP ${response.status} for file ${itemId}; expected HTTP ${expectedStatus}`
    );
  }

  if (!response.content) {
    throw new Error(`Box returned no download stream for file ${itemId}`);
  }

  if (startByte > 0) {
    const contentRange = getResponseHeader(response.headers, "content-range");
    const rangeMatch = contentRange?.match(/^bytes (\d+)-(\d+)\/(\d+|\*)$/);
    if (!rangeMatch || Number(rangeMatch[1]) !== startByte) {
      throw new Error(
        `Box returned an invalid Content-Range for file ${itemId}: ${contentRange ?? "missing"}`
      );
    }
    if (totalBytes !== undefined && rangeMatch[3] !== "*" && Number(rangeMatch[3]) !== totalBytes) {
      throw new Error(
        `Box Content-Range total changed for file ${itemId}: expected ${totalBytes}, received ${rangeMatch[3]}`
      );
    }
  }

  return { content: response.content };
}

function getResponseHeader(headers: Record<string, string>, name: string): string | undefined {
  const headerName = name.toLowerCase();
  return Object.entries(headers).find(([key]) => key.toLowerCase() === headerName)?.[1];
}

function getFileSize(filePath: string): number {
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
}

async function getFileSha1(filePath: string): Promise<string> {
  const hash = createHash("sha1");
  const input = fs.createReadStream(filePath);
  for await (const chunk of input) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function writeBoxDownloadToFile(
  stream: Readable,
  downloadFilePath: string,
  itemId: string,
  startingBytes: number,
  totalBytes: number | undefined,
  onProgress: (bytesDownloaded: number) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(downloadFilePath, {
      flags: startingBytes > 0 ? "a" : "w",
    });
    let bytesDownloaded = startingBytes;
    let lastReportedBytes = startingBytes;
    let lastLoggedBytes = startingBytes;
    let idleTimer: NodeJS.Timeout;
    let settled = false;

    const cleanup = () => {
      clearTimeout(idleTimer);
      stream.removeListener("data", onData);
      stream.removeListener("error", onError);
      output.removeListener("error", onError);
      output.removeListener("finish", onFinish);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      stream.destroy();
      if (output.closed) {
        reject(error);
        return;
      }
      output.once("close", () => reject(error));
      output.destroy();
    };

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        fail(
          new Error(
            `Box download for file ${itemId} stalled after ${BOX_DOWNLOAD_IDLE_TIMEOUT_MS}ms without data`
          )
        );
      }, BOX_DOWNLOAD_IDLE_TIMEOUT_MS);
    };

    const onData = (chunk: Buffer | string) => {
      const chunkSize = typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
      bytesDownloaded += chunkSize;
      resetIdleTimer();

      if (bytesDownloaded - lastReportedBytes >= BOX_DOWNLOAD_CLIENT_PROGRESS_INTERVAL_BYTES) {
        lastReportedBytes = bytesDownloaded;
        onProgress(bytesDownloaded);
      }

      if (
        bytesDownloaded - lastLoggedBytes >= BOX_DOWNLOAD_PROGRESS_INTERVAL_BYTES ||
        (totalBytes !== undefined && bytesDownloaded >= totalBytes)
      ) {
        lastLoggedBytes = bytesDownloaded;
        serverLogger.info({
          logId: "box-download",
          logValue: `Box download progress for ${itemId}: ${bytesDownloaded}/${totalBytes ?? "unknown"} bytes`,
        });
      }
    };

    const onError = (error: Error) => fail(error);
    const onFinish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const finishDownload = () => {
        onProgress(bytesDownloaded);
        serverLogger.info({
          logId: "box-download",
          logValue: `Box stream finished for ${itemId}: ${bytesDownloaded} bytes written`,
        });
        resolve();
      };

      if (output.closed) {
        finishDownload();
      } else {
        output.once("close", finishDownload);
      }
    };

    stream.on("data", onData);
    stream.on("error", onError);
    output.on("error", onError);
    output.on("finish", onFinish);
    resetIdleTimer();
    stream.pipe(output);
  });
}

function beginProgressResponse(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

function writeProgress(res: Response, event: BoxDownloadResponse): void {
  if (!res.writableEnded && !res.destroyed) {
    res.write(`${JSON.stringify(event)}\n`);
  }
}
