import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { applyCreateMissionPriority } from "operations/apply/apply-mission-priority";
import {
  opDeleteMissionPriority,
  opDeleteMissionPriorityCategory,
} from "operations/op-missionPriority";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankActionTemplate } from "store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";

// ── Test lifecycle ────────────────────────────────────────────────────────

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.missionPriorities = {};
    m.actions = {};
    m.actionTemplates = {};
    m.stations = {};
    m.pois = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

// ── opDeleteMissionPriority ─────────────────────────────────────────────────

describe("opDeleteMissionPriority()", () => {
  it("deletes the priority when it is not used by any action or template", () => {
    const handle = getMissionDocHandle();
    let missionPriorityUuid: string;
    handle.change((m) => {
      missionPriorityUuid = applyCreateMissionPriority(m, { category: "Vitest Category" });
    });

    const result = opDeleteMissionPriority(handle, missionPriorityUuid);

    expect(result).toBeUndefined();
    expect(handle.doc().missionPriorities[missionPriorityUuid]).toBeUndefined();
  });

  it("returns an in-use message when the priority is used by an action", () => {
    const handle = getMissionDocHandle();
    let missionPriorityUuid: string;
    handle.change((m) => {
      missionPriorityUuid = applyCreateMissionPriority(m, { category: "Vitest Category" });
    });
    const action = generateBlankAction({ missionPriorityUuid, stationUuid: uuidv4() });
    handle.change((m) => {
      m.actions[action.uuid] = action;
      m.stations[action.stationUuid] = {
        uuid: action.stationUuid,
        name: "Vitest Station A",
      } as unknown as Station;
    });

    const result = opDeleteMissionPriority(handle, missionPriorityUuid);

    expect(result).toContain("being used by one or more actions");
    expect(handle.doc().missionPriorities[missionPriorityUuid]).toBeDefined();
  });

  it("returns an in-use message when the priority is used by a template", () => {
    const handle = getMissionDocHandle();
    let missionPriorityUuid: string;
    handle.change((m) => {
      missionPriorityUuid = applyCreateMissionPriority(m, { category: "Vitest Category" });
    });
    const templateUuid = uuidv4();
    handle.change((m) => {
      m.actionTemplates[templateUuid] = generateBlankActionTemplate({
        templateName: "Vitest Template",
        missionPriorityUuid,
      });
    });

    const result = opDeleteMissionPriority(handle, missionPriorityUuid);

    expect(result).toContain("being used by one or more actions");
    expect(handle.doc().missionPriorities[missionPriorityUuid]).toBeDefined();
  });

  it("does nothing when missionDocHandle is falsy", () => {
    expect(() =>
      opDeleteMissionPriority(null as unknown as DocHandle<Mission>, "uuid")
    ).not.toThrow();
  });

  it("does nothing when missionPriorityUuid is empty", () => {
    const handle = getMissionDocHandle();
    expect(() => opDeleteMissionPriority(handle, "")).not.toThrow();
  });
});

// ── opDeleteMissionPriorityCategory ─────────────────────────────────────────

describe("opDeleteMissionPriorityCategory()", () => {
  it("deletes every trace in the category when none are in use", () => {
    const handle = getMissionDocHandle();
    handle.change((m) => {
      applyCreateMissionPriority(m, { category: "Vitest Category" });
      applyCreateMissionPriority(m, { category: "Vitest Category" });
    });

    const result = opDeleteMissionPriorityCategory(handle, "Vitest Category");

    expect(result).toBeUndefined();
    expect(Object.keys(handle.doc().missionPriorities)).toHaveLength(0);
  });

  it("returns an in-use message when any trace in the category is in use", () => {
    const handle = getMissionDocHandle();
    let missionPriorityUuid: string;
    handle.change((m) => {
      missionPriorityUuid = applyCreateMissionPriority(m, { category: "Vitest Category" });
    });
    const action = generateBlankAction({ missionPriorityUuid, stationUuid: uuidv4() });
    handle.change((m) => {
      m.actions[action.uuid] = action;
      m.stations[action.stationUuid] = {
        uuid: action.stationUuid,
        name: "Vitest Station A",
      } as unknown as Station;
    });

    const result = opDeleteMissionPriorityCategory(handle, "Vitest Category");

    expect(result).toContain("Vitest Category");
    expect(handle.doc().missionPriorities[missionPriorityUuid]).toBeDefined();
  });

  it("does nothing when missionDocHandle is falsy", () => {
    expect(() =>
      opDeleteMissionPriorityCategory(null as unknown as DocHandle<Mission>, "Category")
    ).not.toThrow();
  });

  it("does nothing when category is empty", () => {
    const handle = getMissionDocHandle();
    expect(() => opDeleteMissionPriorityCategory(handle, "")).not.toThrow();
  });
});
