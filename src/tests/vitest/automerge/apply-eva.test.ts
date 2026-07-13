import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import { applyUpsertEva, applyUpdateEvaByField } from "client/automerge/apply/apply-eva";
import { generateBlankEVA } from "store/storeUtils/eva";

const getMission = (): Mission => getMissionDocHandle().doc();

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.stations = {};
    m.traverses = {};
    m.evas = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("apply-eva", () => {
  describe("applyUpdateEvaByField()", () => {
    it("updates a top-level field", () => {
      const eva = generateBlankEVA({ name: "Vitest Eva" });
      getMissionDocHandle().change((m) => applyUpsertEva(m, eva));
      withMissionChange((m) =>
        applyUpdateEvaByField(m, { evaUuid: eva.uuid, fieldName: "name", value: "Vitest Renamed" })
      );
      expect(getMission().evas[eva.uuid].name).toBe("Vitest Renamed");
    });

    it("updates a single element in an array field (index variant)", () => {
      const eva = generateBlankEVA({ name: "Vitest Eva" });
      eva.sequence = [
        { type: "traverse", uuid: "t1" },
        { type: "station", uuid: "s1" },
        { type: "traverse", uuid: "t2" },
      ];
      getMissionDocHandle().change((m) => applyUpsertEva(m, eva));
      withMissionChange((m) =>
        applyUpdateEvaByField(m, {
          evaUuid: eva.uuid,
          fieldName: "sequence",
          index: 1,
          value: { type: "station", uuid: "s-new" },
        })
      );
      expect(getMission().evas[eva.uuid].sequence[1]).toEqual({ type: "station", uuid: "s-new" });
      // other items untouched
      expect(getMission().evas[eva.uuid].sequence[0]).toEqual({ type: "traverse", uuid: "t1" });
    });

    it("preserves updatedAt when preserveUpdatedAt is true", () => {
      const eva = generateBlankEVA({ name: "Vitest Eva", updatedAt: 12345 });
      getMissionDocHandle().change((m) => applyUpsertEva(m, eva));
      withMissionChange((m) =>
        applyUpdateEvaByField(m, {
          evaUuid: eva.uuid,
          fieldName: "name",
          value: "X",
          preserveUpdatedAt: true,
        })
      );
      expect(getMission().evas[eva.uuid].updatedAt).toBe(12345);
    });

    it("updates updatedAt by default", () => {
      const eva = generateBlankEVA({ name: "Vitest Eva", updatedAt: 12345 });
      getMissionDocHandle().change((m) => applyUpsertEva(m, eva));
      withMissionChange((m) =>
        applyUpdateEvaByField(m, { evaUuid: eva.uuid, fieldName: "name", value: "X" })
      );
      expect(getMission().evas[eva.uuid].updatedAt).not.toBe(12345);
    });

    it("is a no-op when EVA doesn't exist", () => {
      withMissionChange((m) =>
        applyUpdateEvaByField(m, { evaUuid: "missing", fieldName: "name", value: "X" })
      );
      expect(Object.keys(getMission().evas).length).toBe(0);
    });
  });
});
