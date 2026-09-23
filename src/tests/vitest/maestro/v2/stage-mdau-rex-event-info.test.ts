/**
 * `stageMdau` — resolving `MdauEva.maestroEventId`/`maestroEventUrl` onto the
 * rex whose `evaUuid` matches the incoming EVA's uuid.
 */
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankRex } from "store/storeUtils/rex";
import { stageMdau } from "server/maestro/v2/operations/stage-mdau";
import { serverLogger } from "utils/logging/serverLogger";
import type { MDAU } from "server/maestro/v2/types/mdau";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Assemble a mission doc from loose entities. */
const buildMission = (args: { evas?: Eva[]; rexes?: Rex[] }): Mission => {
  const mission = generateBlankMission({ id: 9999 });
  for (const eva of args.evas ?? []) mission.evas[eva.uuid] = eva;
  for (const rex of args.rexes ?? []) mission.rexes[rex.uuid] = rex;
  return mission;
};

/** An `aegisEva` payload carrying a Maestro event id/url for one EVA. */
const evaPayload = (
  eva: Eva,
  overrides: Partial<MDAU.MdauEva> = {}
): MDAU.MaestroDataAegisUses => ({
  aegisEva: {
    [eva.uuid]: {
      uuid: eva.uuid,
      name: eva.name,
      maestroEventId: "evt-123",
      maestroEventUrl: "https://maestro.example/events/123",
      sequence: [],
      datetime: eva.datetime,
      updatedAt: 1_700_000_000_000,
      ...overrides,
    },
  },
});

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(serverLogger, "warning").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("stageMdau() — rex event info from MdauEva", () => {
  it("stages maestroEventId/maestroEventUrl onto the rex whose evaUuid matches the EVA", () => {
    const eva = generateBlankEVA({ name: "Vitest EVA" });
    const rex = generateBlankRex({ evaUuid: eva.uuid });
    const mission = buildMission({ evas: [eva], rexes: [rex] });

    const stage = stageMdau(mission, evaPayload(eva), new Set([eva.uuid]));

    expect(stage.rexEventInfo).toHaveLength(1);
    expect(stage.rexEventInfo[0]).toEqual({
      uuid: rex.uuid,
      maestroEventId: "evt-123",
      maestroEventUrl: "https://maestro.example/events/123",
    });
  });

  it("does not stage the maestroEventId/maestroEventUrl fields on the EVA itself", () => {
    const eva = generateBlankEVA({ name: "Vitest EVA" });
    const rex = generateBlankRex({ evaUuid: eva.uuid });
    const mission = buildMission({ evas: [eva], rexes: [rex] });

    // Keep name/datetime/updatedAt identical to the doc so nothing else about
    // the EVA is staged — isolates the assertion to the maestroEventId/Url
    // fields specifically.
    const stage = stageMdau(
      mission,
      evaPayload(eva, { updatedAt: eva.updatedAt }),
      new Set([eva.uuid])
    );

    expect(stage.evas).toHaveLength(0);
  });

  it("does not stage rex event info when the values are unchanged", () => {
    const eva = generateBlankEVA({ name: "Vitest EVA" });
    const rex = generateBlankRex({
      evaUuid: eva.uuid,
      maestroEventId: "evt-123",
      maestroEventUrl: "https://maestro.example/events/123",
    });
    const mission = buildMission({ evas: [eva], rexes: [rex] });

    const stage = stageMdau(mission, evaPayload(eva), new Set([eva.uuid]));

    expect(stage.rexEventInfo).toHaveLength(0);
  });

  it("stages an update when only maestroEventUrl differs", () => {
    const eva = generateBlankEVA({ name: "Vitest EVA" });
    const rex = generateBlankRex({
      evaUuid: eva.uuid,
      maestroEventId: "evt-123",
      maestroEventUrl: "https://maestro.example/events/OLD",
    });
    const mission = buildMission({ evas: [eva], rexes: [rex] });

    const stage = stageMdau(mission, evaPayload(eva), new Set([eva.uuid]));

    expect(stage.rexEventInfo).toEqual([
      {
        uuid: rex.uuid,
        maestroEventId: "evt-123",
        maestroEventUrl: "https://maestro.example/events/123",
      },
    ]);
  });

  it("does nothing (no throw, empty rexEventInfo) when no rex exists for the EVA", () => {
    const eva = generateBlankEVA({ name: "Vitest EVA" });
    const mission = buildMission({ evas: [eva] });

    const stage = stageMdau(mission, evaPayload(eva), new Set([eva.uuid]));

    expect(stage.rexEventInfo).toHaveLength(0);
  });

  it("targets only the rex whose evaUuid matches, ignoring rexes on other EVAs", () => {
    const eva = generateBlankEVA({ name: "Vitest EVA" });
    const otherEva = generateBlankEVA({ name: "Other EVA" });
    const rex = generateBlankRex({ evaUuid: eva.uuid });
    const otherRex = generateBlankRex({ evaUuid: otherEva.uuid });
    const mission = buildMission({ evas: [eva, otherEva], rexes: [rex, otherRex] });

    const stage = stageMdau(mission, evaPayload(eva), new Set([eva.uuid]));

    expect(stage.rexEventInfo).toHaveLength(1);
    expect(stage.rexEventInfo[0].uuid).toBe(rex.uuid);
  });

  it("drops the rex event info when Maestro is not subscribed to the EVA", () => {
    const eva = generateBlankEVA({ name: "Vitest EVA" });
    const rex = generateBlankRex({ evaUuid: eva.uuid });
    const mission = buildMission({ evas: [eva], rexes: [rex] });

    const stage = stageMdau(mission, evaPayload(eva), new Set(["not-an-eva"]));

    expect(stage.rexEventInfo).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });
});
