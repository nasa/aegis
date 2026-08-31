import { missionHasLanderDependentEntities } from "server/express/routes/missionAutomerge";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";

describe("missionHasLanderDependentEntities", () => {
  test("returns false for a blank mission", () => {
    expect(missionHasLanderDependentEntities(generateBlankMission())).toBe(false);
  });

  test("returns true for a placed station", () => {
    const mission = generateBlankMission();
    const station = generateBlankStation({ location: { lat: 1, lng: 2 } });
    mission.stations[station.uuid] = station;

    expect(missionHasLanderDependentEntities(mission)).toBe(true);
  });

  test("returns true for a station with an existing walkback", () => {
    const mission = generateBlankMission();
    const station = generateBlankStation({
      walkbackPath: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
    });
    mission.stations[station.uuid] = station;

    expect(missionHasLanderDependentEntities(mission)).toBe(true);
  });

  test("returns true for a placed lander xgress station", () => {
    const mission = generateBlankMission();
    const landerEgress = generateBlankStation({
      name: "Lander",
      isLanderXgress: true,
      location: { lat: 1, lng: 2 },
    });
    mission.stations[landerEgress.uuid] = landerEgress;

    expect(missionHasLanderDependentEntities(mission)).toBe(true);
  });

  test("returns true for an EVA whose sequence holds a placed station", () => {
    const mission = generateBlankMission();
    const traverse = generateBlankTraverse();
    const landerEgress = generateBlankStation({ name: "Lander", isLanderXgress: true });
    const ingress = generateBlankStation({ name: "Station", location: { lat: 1, lng: 2 } });
    const eva = generateBlankEVA({
      sequence: [
        { type: "station", uuid: landerEgress.uuid },
        { type: "traverse", uuid: traverse.uuid },
        { type: "station", uuid: ingress.uuid },
      ],
    });
    mission.traverses[traverse.uuid] = traverse;
    mission.stations[landerEgress.uuid] = landerEgress;
    mission.stations[ingress.uuid] = ingress;
    mission.evas[eva.uuid] = eva;

    expect(missionHasLanderDependentEntities(mission)).toBe(true);
  });

  test("returns false for a mission whose stations are all unplaced", () => {
    const mission = generateBlankMission();
    const traverse = generateBlankTraverse();
    const station1 = generateBlankStation({ name: "Station A" });
    const station2 = generateBlankStation({ name: "Station B" });
    mission.traverses[traverse.uuid] = traverse;
    mission.stations[station1.uuid] = station1;
    mission.stations[station2.uuid] = station2;

    expect(missionHasLanderDependentEntities(mission)).toBe(false);
  });
});
