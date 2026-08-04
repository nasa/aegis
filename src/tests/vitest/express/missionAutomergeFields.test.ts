import { missionHasLanderDependentAssets } from "server/express/routes/missionAutomerge";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";

describe("missionHasLanderDependentAssets", () => {
  test("returns false for a blank mission", () => {
    expect(missionHasLanderDependentAssets(generateBlankMission())).toBe(false);
  });

  test("returns true for a placed station", () => {
    const mission = generateBlankMission();
    const station = generateBlankStation({ location: { lat: 1, lng: 2 } });
    mission.stations[station.uuid] = station;

    expect(missionHasLanderDependentAssets(mission)).toBe(true);
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

    expect(missionHasLanderDependentAssets(mission)).toBe(true);
  });

  test("returns true for an EVA with a lander-connected traverse", () => {
    const mission = generateBlankMission();
    const traverse = generateBlankTraverse();
    const eva = generateBlankEVA({
      sequence: [{ type: "traverse", uuid: traverse.uuid }],
      egressLocationUuid: "lander",
      ingressLocationUuid: "station",
    });
    mission.traverses[traverse.uuid] = traverse;
    mission.evas[eva.uuid] = eva;

    expect(missionHasLanderDependentAssets(mission)).toBe(true);
  });

  test("ignores EVAs that do not touch the lander", () => {
    const mission = generateBlankMission();
    const traverse = generateBlankTraverse();
    const eva = generateBlankEVA({
      sequence: [{ type: "traverse", uuid: traverse.uuid }],
      egressLocationUuid: "station-a",
      ingressLocationUuid: "station-b",
    });
    mission.traverses[traverse.uuid] = traverse;
    mission.evas[eva.uuid] = eva;

    expect(missionHasLanderDependentAssets(mission)).toBe(false);
  });
});
