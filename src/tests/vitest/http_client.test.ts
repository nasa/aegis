import type { Mock } from "vitest";
import { isLoggedIn, login, logout } from "http-client/login";
import { boxDownloadFile } from "http-client/box";
import { duplicateMission } from "http-client/mission";
import {
  getElevationSinglePoint,
  getTerrainProfile,
  getTerrainProfiles,
} from "http-client/terrainProfile";
import { deleteLayers, upsertLayers } from "http-client/layer";
import { deleteSublayers, upsertSublayers } from "http-client/sublayer";
import { generateBlankLayer } from "store/storeUtils/layer";
import { generateBlankSublayer } from "store/storeUtils/sublayer";

// Helper to mock fetch responses
const mockFetchResponse = (data: unknown) => {
  global.fetch = vi.fn().mockResolvedValueOnce({
    status: 200,
    json: () => Promise.resolve(data),
  } as unknown as Response);
};

describe("Login", () => {
  test("Returns IsLoggedIn", async () => {
    mockFetchResponse(true);
    const res = await isLoggedIn();
    expect(res).toEqual(true);
  });

  test("Returns Login", async () => {
    const username: string = "test_username";
    const password: string = "test_password";
    const mockResponse = {
      status: "success",
      message: "login successful",
      data: {
        user: {
          id: 123,
          permission: "admin",
          username: username,
        },
      },
    };
    mockFetchResponse(mockResponse);
    const res = await login(username, password);
    expect(res).toEqual(mockResponse);
  });

  test("Fails Login", async () => {
    const username: string = "fake_user";
    const password: string = "fake_password";
    const mockResponse = {
      status: "failure",
      message: "No such user.",
    };
    mockFetchResponse(mockResponse);
    const res = await login(username, password);
    expect(res).toEqual(mockResponse);
  });

  test("Returns Logout", async () => {
    const mockResponse = {
      status: "success",
      message: "Logged out",
      data: true,
    };
    mockFetchResponse(mockResponse);
    const res = await logout();
    expect(res).toEqual(mockResponse);
  });
});

describe("Layer and sublayer clients", () => {
  // The admin layers page does not set a missionId in sessionStorage; the clients must send the
  // mission id they are given.
  beforeEach(() => {
    window.sessionStorage.removeItem("missionId");
  });

  const getSentBody = () => JSON.parse((global.fetch as Mock).mock.calls[0][1].body);

  test("upsertLayers sends the given missionId", async () => {
    mockFetchResponse({ status: "success", data: [] });
    const layer = generateBlankLayer({ name: "Vitest Client Layer" });
    await upsertLayers(42, [layer]);
    expect((global.fetch as Mock).mock.calls[0][0]).toBe("/api/v1/layer");
    expect(getSentBody()).toEqual({ missionId: 42, layers: [layer] });
  });

  test("deleteLayers sends the given missionId", async () => {
    mockFetchResponse({ status: "success" });
    await deleteLayers(42, ["layer-uuid"]);
    expect(getSentBody()).toEqual({ missionId: 42, layerUuids: ["layer-uuid"] });
  });

  test("upsertSublayers sends the given missionId", async () => {
    mockFetchResponse({ status: "success", data: [] });
    const sublayer = generateBlankSublayer({ layerUuid: "layer-uuid" });
    await upsertSublayers(42, [sublayer]);
    expect((global.fetch as Mock).mock.calls[0][0]).toBe("/api/v1/sublayer");
    expect(getSentBody()).toEqual({ missionId: 42, sublayers: [sublayer] });
  });

  test("deleteSublayers sends the given missionId", async () => {
    mockFetchResponse({ status: "success" });
    await deleteSublayers(42, ["sublayer-uuid"]);
    expect(getSentBody()).toEqual({ missionId: 42, sublayerUuids: ["sublayer-uuid"] });
  });
});

const mockBoxDownloadResponse = (events: string[]) => {
  const body = new ReadableStream({
    start(controller) {
      events.forEach((event) => controller.enqueue(new TextEncoder().encode(event)));
      controller.close();
    },
  });

  global.fetch = vi.fn().mockResolvedValueOnce({
    status: 200,
    headers: { get: () => "application/x-ndjson; charset=utf-8" },
    body,
  } as unknown as Response);
};

describe("Box download", () => {
  test("parses progress events and encodes the request path", async () => {
    mockBoxDownloadResponse([
      '{"type":"progress","stage":"downloading","bytesDownloaded":1048576,"totalBytes":2097152}\n',
      '{"type":"progress","stage":"extracting","fileName":"large.zip","elapsedSeconds":10}\n',
      '{"status":"success","message":"File downloaded and processed","data":{"success":true}}\n',
    ]);
    const onProgress = vi.fn();

    const response = await boxDownloadFile(12, "42", "mission files/layers", onProgress);

    expect(response).toEqual({
      status: "success",
      message: "File downloaded and processed",
      data: { success: true },
    });
    expect(onProgress).toHaveBeenCalledWith({
      type: "progress",
      stage: "downloading",
      bytesDownloaded: 1048576,
      totalBytes: 2097152,
    });
    expect(onProgress).toHaveBeenCalledWith({
      type: "progress",
      stage: "extracting",
      fileName: "large.zip",
      elapsedSeconds: 10,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/file/boxDownloadFile?missionId=12&itemId=42&path=mission+files%2Flayers"
    );
  });

  test("returns streamed server errors", async () => {
    mockBoxDownloadResponse(['{"status":"error","message":"Box download stalled"}\n']);

    await expect(boxDownloadFile(12, "42", "mission files/layers")).resolves.toEqual({
      status: "error",
      message: "Box download stalled",
    });
  });

  test("parses progress events split across stream chunks", async () => {
    mockBoxDownloadResponse([
      '{"type":"progress","stage":"extracting","elapsedSeconds":20',
      ',"fileName":"large.zip"}\n',
      '{"status":"success","message":"File downloaded and processed","data":{"success":true}}\n',
    ]);
    const onProgress = vi.fn();

    await boxDownloadFile(12, "42", "mission files/layers", onProgress);

    expect(onProgress).toHaveBeenCalledWith({
      type: "progress",
      stage: "extracting",
      elapsedSeconds: 20,
      fileName: "large.zip",
    });
  });
});

describe("Mission duplication", () => {
  test("reads progress across chunks and waits for the final mission ID", async () => {
    mockBoxDownloadResponse([
      '{"type":"progress","message":"Copying GIS ',
      'files...","elapsedSeconds":10}\n\n{"status":"success",',
      '"message":"Mission duplicated","data":51}',
    ]);
    const onProgress = vi.fn();

    const response = await duplicateMission(50, onProgress);

    expect(response).toEqual({ status: "success", message: "Mission duplicated", data: 51 });
    expect(onProgress).toHaveBeenCalledWith({
      type: "progress",
      message: "Copying GIS files...",
      elapsedSeconds: 10,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/missionDup",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/x-ndjson" }),
        body: JSON.stringify({ missionId: 50 }),
      })
    );
  });

  test("returns copy failures sent after streaming has started", async () => {
    mockBoxDownloadResponse([
      '{"type":"progress","message":"Copying GIS files...","elapsedSeconds":0}\n',
      '{"status":"error","message":"rsync exited with code 23"}\n',
    ]);

    await expect(duplicateMission(50)).resolves.toEqual({
      status: "error",
      message: "rsync exited with code 23",
    });
  });

  test("does not report success when the stream ends without confirmation", async () => {
    mockBoxDownloadResponse([
      '{"type":"progress","message":"Copying GIS files...","elapsedSeconds":0}\n',
    ]);

    await expect(duplicateMission(50)).resolves.toMatchObject({
      status: "error",
      message: expect.stringContaining("Check the mission list before retrying"),
    });
  });

  test("accepts the previous JSON response format", async () => {
    mockFetchResponse({ status: "success", data: 51 });
    await expect(duplicateMission(50)).resolves.toEqual({ status: "success", data: 51 });
  });

  test("returns non-JSON gateway errors for the page to display", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 504,
      statusText: "Gateway Time-out",
      json: () => Promise.reject(new SyntaxError("Not JSON")),
    });

    await expect(duplicateMission(50)).resolves.toEqual({
      status: "error",
      message: "504 Gateway Time-out",
    });
  });
});

describe("Terrain profile client", () => {
  test("fetches a batch in one HTTP request and preserves per-profile errors", async () => {
    const results: TerrainProfileResponse[] = [
      {
        status: "success",
        message: "ok",
        data: { elevationsMeters: [[1, 2]], terrainSlopesDegrees: [[1, 2]] },
      },
      { status: "error", message: "busy", httpStatus: 503 },
    ];
    mockFetchResponse({ status: "success", data: results });
    const profiles = ["a", "b"].map((entityKey) => ({
      entityKey,
      path: [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
      ],
      pathSegmentDistances: [10],
    }));
    await expect(getTerrainProfiles(42, profiles)).resolves.toEqual(results);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/terrain-profile/batch?missionId=42",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ profiles }) })
    );
  });

  test("propagates a batch-level HTTP error to each profile", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ status: 401, json: async () => ({ message: "Unauthorized" }) });
    const request = {
      path: [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
      ],
      pathSegmentDistances: [10],
    };
    await expect(getTerrainProfiles(42, [request, request])).resolves.toEqual([
      { status: "error", message: "Unauthorized", httpStatus: 401 },
      { status: "error", message: "Unauthorized", httpStatus: 401 },
    ]);
  });

  test("rejects a batch response with missing profiles", async () => {
    mockFetchResponse({ status: "success", data: [] });
    await expect(
      getTerrainProfiles(42, [
        {
          path: [
            { lat: 0, lng: 0 },
            { lat: 1, lng: 1 },
          ],
          pathSegmentDistances: [10],
        },
      ])
    ).rejects.toThrow("Invalid terrain profile batch response");
  });
  test("returns the combined terrain response", async () => {
    mockFetchResponse({
      status: "success",
      message: "Terrain profile sampled",
      data: {
        elevationsMeters: [[100, 101]],
        terrainSlopesDegrees: [[2, 3]],
      },
    });

    const response = await getTerrainProfile({
      missionId: 42,
      path: [
        { lat: -85, lng: 10 },
        { lat: -85.1, lng: 10.1 },
      ],
      pathSegmentDistances: [20],
    });

    expect(response.data).toEqual({
      elevationsMeters: [[100, 101]],
      terrainSlopesDegrees: [[2, 3]],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/terrain-profile?missionId=42",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          path: [
            { lat: -85, lng: 10 },
            { lat: -85.1, lng: 10.1 },
          ],
          pathSegmentDistances: [20],
          getElevationOnly: false,
          preview: false,
        }),
      })
    );
  });

  test("extracts one elevation using a zero-length terrain profile", async () => {
    mockFetchResponse({
      status: "success",
      message: "Terrain profile sampled",
      data: {
        elevationsMeters: [[123, 123]],
        terrainSlopesDegrees: [[4, 4]],
      },
    });
    const point = { lat: -85, lng: 10 };

    const response = await getElevationSinglePoint({
      missionId: 42,
      point,
    });

    expect(response.data).toBe(123);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/terrain-profile?missionId=42",
      expect.objectContaining({
        body: JSON.stringify({
          path: [point, point],
          pathSegmentDistances: [0],
          getElevationOnly: true,
          preview: false,
        }),
      })
    );
  });
});
