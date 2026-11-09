import { Repo } from "@automerge/automerge-repo/slim";
import { globalValues } from "server/express/global";
import { getAutomergeDocListing } from "server/express/routes/docListing";
import {
  getAutomergeMissions,
  missionHasLanderDependentEntities,
} from "server/express/routes/missionAutomerge";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankStation, generateLanderXgressStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";

vi.mock("server/express/routes/docListing", () => ({ getAutomergeDocListing: vi.fn() }));

describe("mission document enumeration", () => {
  const originalRepo = globalValues.automergeRepo;
  let repo: Repo;

  beforeEach(() => {
    repo = new Repo({ network: [] });
    globalValues.automergeRepo = repo;
    vi.mocked(getAutomergeDocListing).mockReset();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    globalValues.automergeRepo = originalRepo;
    await repo.shutdown();
  });

  test("omits a concurrently deleted mission and still returns the remaining documents", async () => {
    const deleted = repo.create<Mission>(generateBlankMission({ id: 41 }));
    const live = repo.create<Mission>(generateBlankMission({ id: 42, name: "Live mission" }));
    vi.mocked(getAutomergeDocListing)
      .mockResolvedValueOnce([
        { missionId: 41, automergeUrl: deleted.url },
        { missionId: 42, automergeUrl: live.url },
      ])
      .mockResolvedValueOnce([]);
    vi.spyOn(repo, "find").mockRejectedValueOnce(new Error("Document is unavailable"));

    expect(await getAutomergeMissions()).toEqual([live.doc()]);
    expect(getAutomergeDocListing).toHaveBeenNthCalledWith(2, [41]);
  });

  test("propagates document failures when the mission still has a listing", async () => {
    const handle = repo.create<Mission>(generateBlankMission({ id: 41 }));
    const listing = { missionId: 41, automergeUrl: handle.url };
    const error = new Error("Stored document is unavailable");
    vi.mocked(getAutomergeDocListing).mockResolvedValue([listing]);
    vi.spyOn(repo, "find").mockRejectedValueOnce(error);

    await expect(getAutomergeMissions([41])).rejects.toBe(error);
  });
});

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
    const landerEgress = generateLanderXgressStation({
      xgressType: "egress",
      name: "Lander",
      location: { lat: 1, lng: 2 },
      elevation: null,
    });
    mission.stations[landerEgress.uuid] = landerEgress;

    expect(missionHasLanderDependentEntities(mission)).toBe(true);
  });

  test("returns true for an EVA whose sequence holds a placed station", () => {
    const mission = generateBlankMission();
    const traverse = generateBlankTraverse();
    const landerEgress = generateLanderXgressStation({
      xgressType: "egress",
      name: "Lander",
      location: { lat: 0, lng: 0 },
      elevation: null,
    });
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
