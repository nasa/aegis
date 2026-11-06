import { PLANETS, getPlanetRadius, usesLgrsCoordinates } from "utils/planets";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankStation } from "store/storeUtils/station";
import { applyUpdateMissionByField } from "operations/apply/apply-mission";
import { profileInputSignature } from "utils/terrainProfileInputs";

test.each(["earth", "moon", "mars"] as const)("distances use the selected %s radius", (planet) => {
  expect(getPlanetRadius(generateBlankMission({ planet }))).toBe(PLANETS[planet].radius);
});

test.each([
  ["moon", -80.001, true],
  ["moon", -90, true],
  ["moon", -80, false],
  ["moon", 85, false],
  ["earth", -89, false],
  ["mars", -89, false],
  ["moon", null, false],
  ["moon", NaN, false],
  ["moon", -91, false],
] as const)("LGRS for %s at latitude %s is %s", (planet, lat, expected) => {
  expect(
    usesLgrsCoordinates(generateBlankMission({ planet, landerLocation: { lat, lng: 0 } }))
  ).toBe(expected);
});

test("changing planets recalculates saved paths and invalidates terrain profile inputs", () => {
  const points = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
  ];
  const traverse = generateBlankTraverse({ path: points, pathSegmentDistances: [1] });
  const station = generateBlankStation({ walkbackPath: points, walkbackPathSegmentDistances: [1] });
  const mission = generateBlankMission({
    traverses: { [traverse.uuid]: traverse },
    stations: { [station.uuid]: station },
  });
  const oldSignature = profileInputSignature(mission, points, traverse.pathSegmentDistances);
  applyUpdateMissionByField(mission, { fieldName: "planet", value: "mars" });
  const expected = (PLANETS.mars.radius * Math.PI) / 180;
  expect(mission.traverses[traverse.uuid].pathSegmentDistances[0]).toBeCloseTo(expected, 6);
  expect(mission.stations[station.uuid].walkbackPathSegmentDistances[0]).toBeCloseTo(expected, 6);
  expect(profileInputSignature(mission, points, traverse.pathSegmentDistances)).not.toBe(
    oldSignature
  );
});
