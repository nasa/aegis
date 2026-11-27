import { fork } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createServer, request } from "node:http";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect } from "@playwright/test";

export async function startDisposableApi(frontendOrigin: string): Promise<DisposablePlaywrightApi> {
  const reserve = createNetServer();
  await new Promise<void>((resolve) => reserve.listen(0, "127.0.0.1", resolve));
  const address = reserve.address();
  if (!address || typeof address === "string") throw new Error("Missing disposable API port");
  const apiPort = address.port;
  await new Promise<void>((resolve, reject) =>
    reserve.close((error) => (error ? reject(error) : resolve()))
  );

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  let child: ChildProcess | undefined;
  let output = "";
  const start = async (): Promise<void> => {
    output = "";
    child = fork(path.join(root, ".local/express/dist/api/api.js"), [], {
      cwd: root,
      env: { ...process.env, AEGIS_TEST_API_PORT: String(apiPort) },
      execArgv: [
        "--import",
        pathToFileURL(path.join(root, "src/tests/playwright/fixtures/disposableApiPreload.mjs"))
          .href,
      ],
      silent: true,
    });
    child.stdout?.on("data", (data) => (output = (output + String(data)).slice(-12000)));
    child.stderr?.on("data", (data) => (output = (output + String(data)).slice(-12000)));
    await expect
      .poll(
        async () => {
          if (child?.exitCode !== null) throw new Error(`Disposable API exited: ${output}`);
          try {
            return (await fetch(`http://127.0.0.1:${apiPort}/api/v1/health`)).ok;
          } catch {
            return false;
          }
        },
        { timeout: 30000, message: "Wait for the disposable API process" }
      )
      .toBe(true);
  };
  const stop = async (): Promise<void> => {
    const stopping = child;
    if (!stopping || stopping.exitCode !== null) return;
    const exited = new Promise<void>((resolve) => stopping.once("exit", () => resolve()));
    stopping.send("shutdown");
    const force = setTimeout(() => stopping.kill(), 15000);
    try {
      await exited;
    } finally {
      clearTimeout(force);
      child = undefined;
    }
  };

  const proxy = createServer((incoming, outgoing) => {
    const api = /^\/(api|static)(\/|$)/.test(incoming.url ?? "");
    const target = new URL(api ? `http://127.0.0.1:${apiPort}` : frontendOrigin);
    const upstream = request(
      {
        hostname: target.hostname,
        port: target.port,
        path: incoming.url,
        method: incoming.method,
        headers: incoming.headers,
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      }
    );
    upstream.on("error", () => {
      outgoing.writeHead(503);
      outgoing.end("Disposable API unavailable");
    });
    incoming.pipe(upstream);
  });
  proxy.on("upgrade", (incoming, socket, head) => {
    const api = incoming.url?.startsWith("/api/");
    const target = new URL(api ? `http://127.0.0.1:${apiPort}` : frontendOrigin);
    const upstream = request({
      hostname: target.hostname,
      port: target.port,
      path: incoming.url,
      headers: incoming.headers,
    });
    upstream.on("upgrade", (response, upstreamSocket, upstreamHead) => {
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n`);
      for (const [key, value] of Object.entries(response.headers)) {
        socket.write(`${key}: ${value}\r\n`);
      }
      socket.write("\r\n");
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) upstreamSocket.write(head);
      socket.pipe(upstreamSocket).pipe(socket);
      socket.on("error", () => upstreamSocket.destroy());
      upstreamSocket.on("error", () => socket.destroy());
    });
    upstream.on("response", (response) => {
      socket.end(`HTTP/1.1 ${response.statusCode} Rejected\r\nConnection: close\r\n\r\n`);
    });
    upstream.on("error", () => socket.destroy());
    upstream.end();
  });
  try {
    await start();
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const proxyAddress = proxy.address();
    if (!proxyAddress || typeof proxyAddress === "string") throw new Error("Missing proxy port");
    return {
      origin: `http://localhost:${proxyAddress.port}`,
      restart: async () => {
        await stop();
        await start();
      },
      close: async () => {
        await stop();
        proxy.closeAllConnections();
        await new Promise<void>((resolve) => proxy.close(() => resolve()));
      },
    };
  } catch (error) {
    await stop();
    proxy.close();
    throw error;
  }
}
