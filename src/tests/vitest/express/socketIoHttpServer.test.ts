// @vitest-environment node
import type { AddressInfo } from "net";
import type { RequestListener } from "http";
import express from "express";
import { createHttpServerWithSocketIo } from "server/express/httpServer";

// Errors thrown synchronously by the Express app, and every url it was asked to handle. Without
// the try/catch, a throw here is an uncaught exception that exits the API process.
let expressErrors: unknown[];
let expressRequestUrls: string[];
let baseUrl: string;
let closeServer: () => Promise<void>;

beforeAll(async () => {
  // A bare Express app still sets X-Powered-By, which is what threw on the already-sent response.
  const app = express();
  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  const recordingExpressHandler: RequestListener = (request, response) => {
    expressRequestUrls.push(request.url);
    try {
      app(request, response);
    } catch (error) {
      expressErrors.push(error);
    }
  };
  const { server, socketio } = createHttpServerWithSocketIo(recordingExpressHandler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise<void>((resolve) => socketio.close(() => resolve()));
});

beforeEach(() => {
  expressErrors = [];
  expressRequestUrls = [];
});

afterAll(async () => {
  await closeServer();
});

describe("http server with Socket.IO on /api/socket", () => {
  // Reproduces the prod/gold crash of 2026-11-24, triggered by this exact curl request.
  test("a plain HTTP polling request to /api/socket is answered by Socket.IO only and does not throw in Express", async () => {
    const response = await fetch(`${baseUrl}/api/socket/?EIO=4&transport=polling`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: 0, message: "Transport unknown" });
    expect(expressErrors).toEqual([]);
    expect(expressRequestUrls).toEqual([]);
  });

  test("the server keeps serving Express routes after a polling request to /api/socket", async () => {
    await fetch(`${baseUrl}/api/socket/?EIO=4&transport=polling`);
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(expressRequestUrls).toEqual(["/health"]);
    expect(expressErrors).toEqual([]);
  });
});
