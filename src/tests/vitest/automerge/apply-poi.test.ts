import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import { applyUpdatePoiByField } from "client/automerge/apply/apply-poi";
import { generateBlankPoi } from "store/storeUtils/poi";
import { v4 as uuidv4 } from "uuid";

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.pois = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("apply-poi", () => {
  describe("applyUpdatePoiByField()", () => {
    it("updates the specified field on an existing poi", () => {
      const poi = generateBlankPoi({ name: "Vitest Original POI" });
      getMissionDocHandle().change((m) => {
        m.pois[poi.uuid] = poi;
      });

      withMissionChange((m) =>
        applyUpdatePoiByField(m, {
          poiUuid: poi.uuid,
          fieldName: "name",
          value: "Vitest Updated POI",
        })
      );

      expect(getMissionDocHandle().doc().pois[poi.uuid].name).toBe("Vitest Updated POI");
    });

    it("updates poi updatedAt by default", () => {
      const poi = generateBlankPoi({ name: "Vitest POI" });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.pois[poi.uuid] = poi;
      });
      const originalUpdatedAt = missionDocHandle.doc().pois[poi.uuid].updatedAt;
      vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(originalUpdatedAt + 10);

      withMissionChange((m) =>
        applyUpdatePoiByField(m, { poiUuid: poi.uuid, fieldName: "name", value: "New Name" })
      );

      // updatedAt should be strictly greater than the original
      expect(missionDocHandle.doc().pois[poi.uuid].updatedAt).toBeGreaterThan(originalUpdatedAt);
    });

    it("does not change updatedAt when preserveUpdatedAt is true", () => {
      const poi = generateBlankPoi({ name: "Vitest POI" });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.pois[poi.uuid] = poi;
      });
      const originalUpdatedAt = missionDocHandle.doc().pois[poi.uuid].updatedAt;

      withMissionChange((m) =>
        applyUpdatePoiByField(m, {
          poiUuid: poi.uuid,
          fieldName: "name",
          value: "Preserved",
          preserveUpdatedAt: true,
        })
      );

      expect(missionDocHandle.doc().pois[poi.uuid].updatedAt).toBe(originalUpdatedAt);
    });

    it("does nothing when poi uuid does not exist", () => {
      expect(() =>
        withMissionChange((m) =>
          applyUpdatePoiByField(m, { poiUuid: uuidv4(), fieldName: "name", value: "x" })
        )
      ).not.toThrow();
    });
  });
});
