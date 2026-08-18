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

  test("returns true for an EVA with a lander-connected traverse", () => {
    const mission = generateBlankMission();
    const traverse = generateBlankTraverse();
    // A lander stand-in in the egress slot makes the first traverse lander-bound.
    const landerEgress = generateBlankStation({ name: "Lander", isLanderXgress: true });
    const ingress = generateBlankStation({ name: "Station" });
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

  test("ignores EVAs that do not touch the lander", () => {
    const mission = generateBlankMission();
    const traverse = generateBlankTraverse();
    // Both xgress slots hold real, unplaced stations, so nothing depends on the lander.
    const egress = generateBlankStation({ name: "Station A" });
    const ingress = generateBlankStation({ name: "Station B" });
    const eva = generateBlankEVA({
      sequence: [
        { type: "station", uuid: egress.uuid },
        { type: "traverse", uuid: traverse.uuid },
        { type: "station", uuid: ingress.uuid },
      ],
    });
    mission.traverses[traverse.uuid] = traverse;
    mission.stations[egress.uuid] = egress;
    mission.stations[ingress.uuid] = ingress;
    mission.evas[eva.uuid] = eva;

    expect(missionHasLanderDependentEntities(mission)).toBe(false);
  });
});
