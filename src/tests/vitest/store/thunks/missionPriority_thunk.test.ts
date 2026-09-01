import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import { applyCreateMissionPriority } from "operations/apply/apply-mission-priority";
import {
  thunkDocDeleteMissionPriority,
  thunkDocDeleteMissionPriorityCategory,
} from "store/thunk/thunkMissionPriority";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankActionTemplate } from "store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";
import { createCustomTestStore } from "../../fixtures/store";

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
  vi.spyOn(window, "alert").mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("thunkDocDeleteMissionPriority", () => {
  it("deletes the priority when it is not used by any action or template", async () => {
    const missionPriorityUuid = withMissionChange((m) =>
      applyCreateMissionPriority(m, { category: "Vitest Category" })
    );

    const store = createCustomTestStore({});
    await store.dispatch(thunkDocDeleteMissionPriority({ missionPriorityUuid }));

    expect(getMissionDocHandle().doc().missionPriorities[missionPriorityUuid]).toBeUndefined();
  });

  it("returns a rejection with a message when the priority is used by an action", async () => {
    const missionPriorityUuid = withMissionChange((m) =>
      applyCreateMissionPriority(m, { category: "Vitest Category" })
    );
    const action = generateBlankAction({ missionPriorityUuid, stationUuid: uuidv4() });
    getMissionDocHandle().change((m) => {
      m.actions[action.uuid] = action;
      m.stations[action.stationUuid] = {
        uuid: action.stationUuid,
        name: "Vitest Station A",
      } as unknown as Station;
    });

    const store = createCustomTestStore({});
    const result = await store.dispatch(thunkDocDeleteMissionPriority({ missionPriorityUuid }));

    expect(thunkDocDeleteMissionPriority.rejected.match(result)).toBe(true);
    expect(result.payload).toContain("being used by one or more actions");
    expect(getMissionDocHandle().doc().missionPriorities[missionPriorityUuid]).toBeDefined();
  });

  it("returns a rejection with a message when the priority is used by a template", async () => {
    const missionPriorityUuid = withMissionChange((m) =>
      applyCreateMissionPriority(m, { category: "Vitest Category" })
    );
    const templateUuid = uuidv4();
    getMissionDocHandle().change((m) => {
      m.actionTemplates[templateUuid] = generateBlankActionTemplate({
        templateName: "Vitest Template",
        missionPriorityUuid,
      });
    });

    const store = createCustomTestStore({});
    const result = await store.dispatch(thunkDocDeleteMissionPriority({ missionPriorityUuid }));

    expect(thunkDocDeleteMissionPriority.rejected.match(result)).toBe(true);
    expect(result.payload).toContain("being used by one or more actions");
    expect(getMissionDocHandle().doc().missionPriorities[missionPriorityUuid]).toBeDefined();
  });
});

describe("thunkDocDeleteMissionPriorityCategory", () => {
  it("deletes every trace in the category when none are in use", async () => {
    withMissionChange((m) => {
      applyCreateMissionPriority(m, { category: "Vitest Category" });
      applyCreateMissionPriority(m, { category: "Vitest Category" });
    });

    const store = createCustomTestStore({});
    await store.dispatch(thunkDocDeleteMissionPriorityCategory({ category: "Vitest Category" }));

    expect(Object.keys(getMissionDocHandle().doc().missionPriorities)).toHaveLength(0);
  });

  it("returns a rejection when any trace in the category is in use", async () => {
    const missionPriorityUuid = withMissionChange((m) =>
      applyCreateMissionPriority(m, { category: "Vitest Category" })
    );
    const action = generateBlankAction({ missionPriorityUuid, stationUuid: uuidv4() });
    getMissionDocHandle().change((m) => {
      m.actions[action.uuid] = action;
      m.stations[action.stationUuid] = {
        uuid: action.stationUuid,
        name: "Vitest Station A",
      } as unknown as Station;
    });

    const store = createCustomTestStore({});
    const result = await store.dispatch(
      thunkDocDeleteMissionPriorityCategory({ category: "Vitest Category" })
    );

    expect(thunkDocDeleteMissionPriorityCategory.rejected.match(result)).toBe(true);
    expect(result.payload).toContain("Vitest Category");
    expect(getMissionDocHandle().doc().missionPriorities[missionPriorityUuid]).toBeDefined();
  });
});
