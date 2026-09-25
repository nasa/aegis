import { getAppUsers } from "http-client/access/appUsers";
import { getUserGroups } from "http-client/access/userGroup";
import { boxDownloadFile } from "http-client/box";
import { getElevationSinglePoint, getTerrainProfile } from "http-client/terrainProfile";

// Helper to mock fetch responses
const mockFetchResponse = (data: unknown) => {
  global.fetch = vi.fn().mockResolvedValueOnce({
    status: 200,
    json: () => Promise.resolve(data),
  } as unknown as Response);
};

describe("Access http-client", () => {
  test("Returns users", async () => {
    const mockResponse: WrappedResponse<AppUserSummary[]> = {
      status: "success",
      message: "Users retrieved",
      data: [
        {
          id: 1,
          uupic: "1234",
          auid: "narmstra",
          displayName: "Neil",
          isSystem: false,
          lastLoginAt: 1_700_000_000_000,
          hasPermissions: true,
        },
      ],
    };
    mockFetchResponse(mockResponse);
    const res = await getAppUsers({ search: "neil" });
    expect(res).toEqual(mockResponse);
  });

  test("Returns user groups", async () => {
    const mockResponse: WrappedResponse<UserGroupSummary[]> = {
      status: "success",
      message: "Groups retrieved",
      data: [
        {
          id: 1,
          name: "Flight Controllers",
          description: null,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
          memberCount: 1,
          missionCount: 0,
        },
      ],
    };
    mockFetchResponse(mockResponse);
    const res = await getUserGroups();
    expect(res).toEqual(mockResponse);
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

describe("Terrain profile client", () => {
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
        }),
      })
    );
  });
});
