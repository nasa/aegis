import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import {
  applyCreateGeoUnit,
  applyUpdateGeoUnitByField,
} from "operations/apply/apply-mission-geoUnit";
import { v4 as uuidv4 } from "uuid";

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.geographicUnits = {};
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

describe("apply-mission-geoUnit", () => {
  describe("withMissionChange((m) => applyCreateGeoUnit(m))", () => {
    it("adds a new geographic unit to the mission", () => {
      withMissionChange((m) => applyCreateGeoUnit(m));

      const doc = getMissionDocHandle().doc();
      expect(Object.keys(doc.geographicUnits)).toHaveLength(1);
    });

    it("creates geographic unit with default name and abbreviation", () => {
      withMissionChange((m) => applyCreateGeoUnit(m));

      const units = Object.values(getMissionDocHandle().doc().geographicUnits);
      expect(units[0].name).toBe("(Geographic Unit Name)");
      expect(units[0].abbr).toBe("GU");
    });
  });

  describe("applyUpdateGeoUnitByField()", () => {
    it("updates the name of an existing geographic unit", () => {
      withMissionChange((m) => applyCreateGeoUnit(m));
      const missionDocHandle = getMissionDocHandle();
      const geoUnitUuid = Object.keys(missionDocHandle.doc().geographicUnits)[0];

      withMissionChange((m) =>
        applyUpdateGeoUnitByField(m, { geoUnitUuid, fieldName: "name", value: "Crater Rim" })
      );

      expect(missionDocHandle.doc().geographicUnits[geoUnitUuid].name).toBe("Crater Rim");
    });

    it("updates the abbr of an existing geographic unit", () => {
      withMissionChange((m) => applyCreateGeoUnit(m));
      const missionDocHandle = getMissionDocHandle();
      const geoUnitUuid = Object.keys(missionDocHandle.doc().geographicUnits)[0];

      withMissionChange((m) =>
        applyUpdateGeoUnitByField(m, { geoUnitUuid, fieldName: "abbr", value: "CR" })
      );

      expect(missionDocHandle.doc().geographicUnits[geoUnitUuid].abbr).toBe("CR");
    });

    it("updates mission updatedAt", () => {
      withMissionChange((m) => applyCreateGeoUnit(m));
      const missionDocHandle = getMissionDocHandle();
      const geoUnitUuid = Object.keys(missionDocHandle.doc().geographicUnits)[0];
      const before = missionDocHandle.doc().updatedAt;
      vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(before + 10);

      withMissionChange((m) =>
        applyUpdateGeoUnitByField(m, { geoUnitUuid, fieldName: "name", value: "New Name" })
      );

      expect(missionDocHandle.doc().updatedAt).toBeGreaterThan(before);
    });

    it("does nothing when geographic unit uuid does not exist", () => {
      expect(() =>
        withMissionChange((m) =>
          applyUpdateGeoUnitByField(m, { geoUnitUuid: uuidv4(), fieldName: "name", value: "x" })
        )
      ).not.toThrow();
    });
  });
});
