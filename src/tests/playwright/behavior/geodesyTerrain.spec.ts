import { test, expect } from "../fixtures/behavioralTest";

test("terrain HTTP validation rejects missing DEM, invalid coordinates and over-limit sampling", async ({
  request,
  mission,
}) => {
  const profilePath = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
  ];
  await mission.change((doc) => {
    doc.demResolution = 10;
    doc.demFilePath = "";
  });
  const missingDem = await request.post(`/api/v1/terrain-profile?missionId=${mission.id}`, {
    data: { path: profilePath, pathSegmentDistances: [100] },
  });
  const missingBody = await missingDem.json();
  expect(missingDem.status(), JSON.stringify(missingBody)).toBe(400);
  expect(missingBody.message).toBe("Mission does not have a DEM configured");

  const invalidCoordinates = await request.post(`/api/v1/terrain-profile?missionId=${mission.id}`, {
    data: { path: [{ lat: 91, lng: 0 }, profilePath[1]], pathSegmentDistances: [100] },
  });
  expect(invalidCoordinates.status()).toBe(400);
  expect((await invalidCoordinates.json()).message).toContain("invalid coordinates");

  const overLimit = await request.post(`/api/v1/terrain-profile?missionId=${mission.id}`, {
    data: { path: profilePath, pathSegmentDistances: [1_000_000] },
  });
  expect(overLimit.status()).toBe(400);
  expect((await overLimit.json()).message).toContain("sample limit");
});
