import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import {
  applyToggleStationCircleVisible,
  applyUpdateStationByField,
  applyUpdateStationCircleStyle,
} from "client/automerge/apply/apply-station";
import { generateBlankStation } from "store/storeUtils/station";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";
import cloneDeep from "lodash/cloneDeep";
import { v4 as uuidv4 } from "uuid";

const getMission = (): Mission => getMissionDocHandle().doc();

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.stations = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("apply-station", () => {
  describe("applyUpdateStationByField()", () => {
    it("updates the specified field on an existing station", () => {
      const station = generateBlankStation({ name: "Vitest Original Station" });
      getMissionDocHandle().change((m) => {
        m.stations[station.uuid] = station;
      });

      withMissionChange((m) =>
        applyUpdateStationByField(m, {
          stationUuid: station.uuid,
          fieldName: "name",
          value: "Vitest Updated Station",
        })
      );

      expect(getMissionDocHandle().doc().stations[station.uuid].name).toBe(
        "Vitest Updated Station"
      );
    });

    it("updates station updatedAt by default", () => {
      const station = generateBlankStation({ name: "Vitest Station" });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.stations[station.uuid] = station;
      });
      const before = missionDocHandle.doc().stations[station.uuid].updatedAt;
      vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(before + 10);

      withMissionChange((m) =>
        applyUpdateStationByField(m, {
          stationUuid: station.uuid,
          fieldName: "name",
          value: "Vitest New Name",
        })
      );

      // updatedAt should be strictly greater than the value before the update
      expect(missionDocHandle.doc().stations[station.uuid].updatedAt).toBeGreaterThan(before);
    });

    it("does not change updatedAt when preserveUpdatedAt is true", () => {
      const station = generateBlankStation({ name: "Vitest Station", updatedAt: null });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.stations[station.uuid] = station;
      });

      withMissionChange((m) =>
        applyUpdateStationByField(m, {
          stationUuid: station.uuid,
          fieldName: "name",
          value: "Vitest Preserved",
          preserveUpdatedAt: true,
        })
      );

      expect(missionDocHandle.doc().stations[station.uuid].updatedAt).toBeNull();
    });

    it("does nothing when station uuid does not exist", () => {
      expect(() =>
        withMissionChange((m) =>
          applyUpdateStationByField(m, { stationUuid: uuidv4(), fieldName: "name", value: "x" })
        )
      ).not.toThrow();
    });
  });

  describe("applyToggleStationCircleVisible()", () => {
    it("flips the `visible` flag on the station's mapCircleControls entry", () => {
      const circleUuid = uuidv4();
      const station = generateBlankStation({
        name: "Vitest Station With Circles",
        mapCircleControls: {
          [circleUuid]: { uuid: circleUuid, visible: false, style: null },
        },
      });
      getMissionDocHandle().change((m) => {
        m.stations[station.uuid] = station;
      });

      withMissionChange((m) =>
        applyToggleStationCircleVisible(m, { stationUuid: station.uuid, circleUuid })
      );
      expect(getMission().stations[station.uuid].mapCircleControls[circleUuid].visible).toBe(true);

      // toggle back
      withMissionChange((m) =>
        applyToggleStationCircleVisible(m, { stationUuid: station.uuid, circleUuid })
      );
      expect(getMission().stations[station.uuid].mapCircleControls[circleUuid].visible).toBe(false);
    });

    it("updates station updatedAt", () => {
      const circleUuid = uuidv4();
      const station = generateBlankStation({
        name: "Vitest Station",
        updatedAt: 12345,
        mapCircleControls: {
          [circleUuid]: { uuid: circleUuid, visible: false, style: null },
        },
      });
      getMissionDocHandle().change((m) => {
        m.stations[station.uuid] = station;
      });
      withMissionChange((m) =>
        applyToggleStationCircleVisible(m, { stationUuid: station.uuid, circleUuid })
      );
      expect(getMission().stations[station.uuid].updatedAt).not.toBe(12345);
    });

    it("is a no-op when the station doesn't exist", () => {
      const before = Object.keys(getMission().stations).length;
      withMissionChange((m) =>
        applyToggleStationCircleVisible(m, { stationUuid: "missing", circleUuid: uuidv4() })
      );
      expect(Object.keys(getMission().stations).length).toBe(before);
    });
  });

  describe("applyUpdateStationCircleStyle()", () => {
    it("sets the style on the station's mapCircleControls entry", () => {
      const circleUuid = uuidv4();
      const station = generateBlankStation({
        name: "Vitest Station With Circles",
        mapCircleControls: {
          [circleUuid]: { uuid: circleUuid, visible: true, style: null },
        },
      });
      getMissionDocHandle().change((m) => {
        m.stations[station.uuid] = station;
      });
      const newStyle: MapSublayerStyle = {
        ...cloneDeep(defaultSublayerStyle),
        color: "#abcdef",
        fillColor: "#012345",
      };
      withMissionChange((m) =>
        applyUpdateStationCircleStyle(m, {
          stationUuid: station.uuid,
          circleUuid,
          layerStyle: newStyle,
        })
      );
      expect(getMission().stations[station.uuid].mapCircleControls[circleUuid].style).toEqual(
        newStyle
      );
    });

    it("is a no-op when the station doesn't exist", () => {
      const before = Object.keys(getMission().stations).length;
      withMissionChange((m) =>
        applyUpdateStationCircleStyle(m, {
          stationUuid: "missing",
          circleUuid: uuidv4(),
          layerStyle: cloneDeep(defaultSublayerStyle),
        })
      );
      expect(Object.keys(getMission().stations).length).toBe(before);
    });
  });
});
