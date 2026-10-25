import { createServer } from "node:http";
import { createHash } from "node:crypto";

const folders = new Map();
const files = new Map();
const rootFolderIds = new Set(["0"]);
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/health") return json(200, { ready: true });
  if (url.pathname === "/__fixtures" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const fixture = JSON.parse(body);
    if (fixture.rootFolderId) rootFolderIds.add(String(fixture.rootFolderId));
    folders.set(fixture.id, fixture);
    for (const item of fixture.files)
      files.set(item.id, { ...item, bytes: Buffer.from(item.base64, "base64"), requests: [] });
    return json(200, { ready: true });
  }
  if (url.pathname.startsWith("/__fixtures/"))
    return json(200, { requests: files.get(url.pathname.split("/").pop())?.requests });
  if (url.pathname === "/oauth2/token")
    return json(200, {
      access_token: "provider-fixture-token",
      expires_in: 3600,
      token_type: "bearer",
    });
  if (req.headers.authorization !== "Bearer provider-fixture-token")
    return json(403, {
      type: "error",
      status: 403,
      code: "access_denied",
      message: "Fixture permission denied",
    });
  const metadata = (file) => ({
    id: file.id,
    type: "file",
    name: file.name,
    size: file.bytes.length,
    sha1: createHash("sha1").update(file.bytes).digest("hex"),
    sequence_id: "0",
    etag: "0",
  });
  const folder = url.pathname.match(/^\/2\.0\/folders\/([^/]+)\/items$/);
  if (folder) {
    const entries = rootFolderIds.has(folder[1])
      ? [...folders.values()].map((item) => ({
          id: item.id,
          type: "folder",
          name: item.name,
          sequence_id: "0",
          etag: "0",
        }))
      : (folders.get(folder[1])?.files ?? []).map((item) => metadata(files.get(item.id)));
    return json(200, { total_count: entries.length, entries, offset: 0, limit: 100 });
  }
  const fileMatch = url.pathname.match(/^\/2\.0\/files\/([^/]+)(\/content)?$/);
  const file = fileMatch && files.get(fileMatch[1]);
  if (!file)
    return json(404, { type: "error", status: 404, code: "not_found", message: "Missing fixture" });
  if (!fileMatch[2]) return json(200, metadata(file));
  const start = Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1] ?? 0);
  file.requests.push(start);
  if (file.mode === "permission")
    return json(403, {
      type: "error",
      status: 403,
      code: "access_denied",
      message: "Fixture permission denied",
    });
  const body = file.bytes.subarray(start);
  const interruptedBody = body.subarray(0, Math.min(body.length - 1, 1024 * 1024));
  res.writeHead(start ? 206 : 200, {
    "content-type": "application/octet-stream",
    "content-length": file.mode === "network" ? interruptedBody.length : body.length,
    ...(start
      ? { "content-range": `bytes ${start}-${file.bytes.length - 1}/${file.bytes.length}` }
      : {}),
  });
  if (file.mode === "network") {
    return res.end(interruptedBody);
  }
  const midpoint = Math.min(body.length, 1024 * 1024);
  res.write(body.subarray(0, midpoint));
  setTimeout(() => res.end(body.subarray(midpoint)), 1000);
});
server.listen(Number(process.env.PLAYWRIGHT_BOX_PORT ?? 4179), "127.0.0.1");
