import { createCustomTestStore } from "../../fixtures/store";
import { thunkDocCreatePosSource, thunkDocDeletePosSource } from "store/thunk/thunkRexPosSource";
import { generateBlankPosEntry, generateBlankRex } from "store/storeUtils/rex";
import { generateBlankEVA } from "store/storeUtils/eva";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { v4 as uuidv4 } from "uuid";

const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => true);

const getMission = (): Mission => getMissionDocHandle().doc();

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.rexes = {};
    m.evas = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
  alertSpy.mockRestore();
});

describe("Thunk Rex PosSource Tests", () => {
  describe("thunkDocCreatePosSource", () => {
    it("appends a new posSource to the selected rex", async () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const rex = generateBlankRex({ name: "Vitest Rex", evaUuid: eva.uuid });
      const startingCount = rex.posSources.length;
      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });
      const store = createCustomTestStore({
        rex: {
          selectedRexUuid: rex.uuid,
          selectedPosEntryUuid: null,
          posEntryInEdit: null,
        },
      });

      await store.dispatch(thunkDocCreatePosSource());
      const updatedRex = getMission().rexes[rex.uuid];
      expect(updatedRex.posSources.length).toBe(startingCount + 1);
      // Blank pos source has placeholder values
      const newOne = updatedRex.posSources[updatedRex.posSources.length - 1];
      expect(newOne.name).toBe("(Blank)");
      expect(newOne.abbr).toBe("B");
      expect(newOne.uuid).toBeTruthy();
    });

    it("alerts and refuses to add when there are already 4 posSources", async () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const rex = generateBlankRex({ name: "Vitest Rex", evaUuid: eva.uuid });
      // pad up to 4 posSources
      while (rex.posSources.length < 4) {
        rex.posSources.push({
          uuid: `extra-${rex.posSources.length}`,
          abbr: "X",
          name: "Vitest Extra",
        });
      }
      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });
      const store = createCustomTestStore({
        rex: {
          selectedRexUuid: rex.uuid,
          selectedPosEntryUuid: null,
          posEntryInEdit: null,
        },
      });

      await store.dispatch(thunkDocCreatePosSource());
      expect(alertSpy).toHaveBeenCalled();
      expect(getMission().rexes[rex.uuid].posSources.length).toBe(4);
    });

    it("is a no-op if no rex is selected", async () => {
      const store = createCustomTestStore({
        rex: {
          selectedRexUuid: null,
          selectedPosEntryUuid: null,
          posEntryInEdit: null,
        },
      });

      await store.dispatch(thunkDocCreatePosSource());
      expect(Object.keys(getMission().rexes).length).toBe(0);
    });
  });

  describe("thunkDocDeletePosSource", () => {
    const makeRexWithTwoPosSource = () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const rex = generateBlankRex({ name: "Vitest Rex", evaUuid: eva.uuid });
      // generateBlankRex starts with 3 sources; use only 2 for clarity
      const posSourceUuid = rex.posSources[0].uuid;
      const posSourceUuid2 = rex.posSources[1].uuid;
      rex.posSources = [
        { uuid: posSourceUuid, abbr: "A", name: "Source A" },
        { uuid: posSourceUuid2, abbr: "B", name: "Source B" },
      ];
      rex.posEntries = [];
      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });
      return { rexUuid: rex.uuid, posSourceUuid, posSourceUuid2 };
    };

    it("deletes a posSource when it is not in use", async () => {
      const { rexUuid, posSourceUuid } = makeRexWithTwoPosSource();
      const store = createCustomTestStore({});
      const result = await store.dispatch(thunkDocDeletePosSource({ rexUuid, posSourceUuid }));
      expect(thunkDocDeletePosSource.rejected.match(result)).toBe(false);
      const rex = getMission().rexes[rexUuid];
      expect(rex.posSources.find((ps) => ps.uuid === posSourceUuid)).toBeUndefined();
    });

    it("rejects when posSource is the last remaining one", async () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const posSourceUuid = uuidv4();
      const rex = generateBlankRex({ name: "Vitest Rex", evaUuid: eva.uuid });
      rex.posSources = [{ uuid: posSourceUuid, abbr: "A", name: "Source A" }];
      rex.posEntries = [];
      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });
      const store = createCustomTestStore({});
      const result = await store.dispatch(
        thunkDocDeletePosSource({ rexUuid: rex.uuid, posSourceUuid })
      );
      expect(thunkDocDeletePosSource.rejected.match(result)).toBe(true);
      expect(result.payload).toContain("at least one Position Source");
      expect(getMission().rexes[rex.uuid].posSources).toHaveLength(1);
    });

    it("rejects when posSource is used by a posEntry", async () => {
      const { rexUuid, posSourceUuid } = makeRexWithTwoPosSource();
      getMissionDocHandle().change((m) => {
        const rex = m.rexes[rexUuid];
        rex.posEntries = [generateBlankPosEntry({ posSourceUuid }) as PosEntry];
      });
      const store = createCustomTestStore({});
      const result = await store.dispatch(thunkDocDeletePosSource({ rexUuid, posSourceUuid }));
      expect(thunkDocDeletePosSource.rejected.match(result)).toBe(true);
      expect(result.payload).toContain("Position Entries");
    });
  });
});
