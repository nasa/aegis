/**
 * apollo14Seed.test.ts
 *
 * Guards the static "Apollo 14" demo seed data against schema drift. The seed
 * mission is hand-authored (see `apollo14SeedData.ts`), so it can silently fall
 * out of sync with the `Mission` type. These tests catch that by validating the
 * built mission against `missionValidator` (compiled from the generated
 * `.local/schemas/mission.json`) and by checking internal referential integrity.
 */
import { missionValidator } from "utils/validateSchemaServer";
import { selectAsPlannedStations } from "store/selectors";
import {
  apollo14Layers,
  apollo14Preset,
  apollo14Sublayers,
  buildApollo14Mission,
  stampMissionId,
} from "server/automerge/seeder/apollo14SeedData";

const VALID_SUBLAYER_TYPES: SublayerType[] = ["vector", "tile", "vector-tile"];

describe("Apollo 14 seed data", () => {
  describe("buildApollo14Mission()", () => {
    it("passes the generated Mission JSON schema (drift guard)", () => {
      const mission = buildApollo14Mission();
      const valid = missionValidator(structuredClone(mission));
      expect(
        valid,
        `Seed mission failed missionValidator - seed is out of date from the Mission schema:\n${JSON.stringify(
          missionValidator.errors,
          null,
          2
        )}`
      ).toBe(true);
    });

    const expectMissionIds = (mission: Mission, id: number): void => {
      const entityMaps = [
        mission.pois,
        mission.stations,
        mission.traverses,
        mission.actions,
        mission.evas,
        mission.rexes,
      ];
      for (const map of entityMaps) {
        for (const entity of Object.values(map)) {
          expect(entity.missionId).toBe(id);
        }
      }
    };

    it("uses a placeholder id of 1 before the runner stamps the real id", () => {
      const mission = buildApollo14Mission();
      expect(mission.id).toBe(1);
      expectMissionIds(mission, 1);
    });

    it("stampMissionId stamps the assigned id onto the mission and every entity", () => {
      const mission = buildApollo14Mission();
      stampMissionId(mission, 42);
      expect(mission.id).toBe(42);
      expectMissionIds(mission, 42);
    });

    it("has referentially-intact EVA sequences and REX eva refs", () => {
      const mission = buildApollo14Mission();
      const stationUuids = new Set(Object.keys(mission.stations));
      const traverseUuids = new Set(Object.keys(mission.traverses));
      const evaUuids = new Set(Object.keys(mission.evas));

      for (const eva of Object.values(mission.evas)) {
        // xgress locations are either the literal "lander" or an existing station.
        for (const xgress of [eva.egressLocationUuid, eva.ingressLocationUuid]) {
          if (xgress !== "lander") {
            expect(stationUuids.has(xgress)).toBe(true);
          }
        }

        // Every sequence item resolves to a station or traverse of its type.
        for (const item of eva.sequence) {
          const pool = item.type === "station" ? stationUuids : traverseUuids;
          expect(
            pool.has(item.uuid),
            `EVA "${eva.name}" sequence ${item.type} uuid ${item.uuid} is dangling`
          ).toBe(true);
        }
      }

      for (const rex of Object.values(mission.rexes)) {
        expect(
          rex.evaUuid !== null && evaUuids.has(rex.evaUuid),
          `REX "${rex.name}" evaUuid ${rex.evaUuid} does not resolve to an EVA`
        ).toBe(true);
      }
    });

    it("has referentially-intact actions, action definitions, and station links", () => {
      const mission = buildApollo14Mission();
      const stationUuids = new Set(Object.keys(mission.stations));
      const traverseUuids = new Set(Object.keys(mission.traverses));
      const poiUuids = new Set(Object.keys(mission.pois));
      const actionUuids = new Set(Object.keys(mission.actions));
      const verbUuids = new Set(Object.keys(mission.actionDefinitions?.verbs ?? {}));
      const nounUuids = new Set(Object.keys(mission.actionDefinitions?.nouns ?? {}));
      const adjectiveUuids = new Set(Object.keys(mission.actionDefinitions?.adjectives ?? {}));

      for (const action of Object.values(mission.actions)) {
        // Every action is attached to exactly one existing owner (station/poi/traverse).
        const owners = [
          action.stationUuid && stationUuids.has(action.stationUuid),
          action.poiUuid && poiUuids.has(action.poiUuid),
          action.traverseUuid && traverseUuids.has(action.traverseUuid),
        ].filter(Boolean);
        expect(
          owners.length,
          `Action "${action.name}" (${action.uuid}) is orphaned or references a missing owner`
        ).toBe(1);

        // Its verb/noun/adjective definitions resolve to the mission's actionDefinitions.
        const def = action.actionDefinition;
        if (def?.verbUuid) expect(verbUuids.has(def.verbUuid)).toBe(true);
        if (def?.nounUuid) expect(nounUuids.has(def.nounUuid)).toBe(true);
        if (def?.adjectiveUuid) expect(adjectiveUuids.has(def.adjectiveUuid)).toBe(true);
      }

      // Station action/poi order lists reference only existing entities, and a station-owned
      // action appears in its station's actionOrderUuids.
      for (const station of Object.values(mission.stations)) {
        for (const actionUuid of station.actionOrderUuids) {
          expect(
            actionUuids.has(actionUuid),
            `Station "${station.name}" actionOrderUuid ${actionUuid} is dangling`
          ).toBe(true);
        }
        for (const poiUuid of station.poiUuids) {
          expect(
            poiUuids.has(poiUuid),
            `Station "${station.name}" poiUuid ${poiUuid} is dangling`
          ).toBe(true);
        }
      }
      for (const action of Object.values(mission.actions)) {
        if (action.stationUuid) {
          expect(
            mission.stations[action.stationUuid].actionOrderUuids.includes(action.uuid),
            `Action "${action.name}" is not listed in station ${action.stationUuid} actionOrderUuids`
          ).toBe(true);
        }
      }
    });

    it("keeps every seeded station visible in the planning view", () => {
      // A station tied to an EVA that has an execution REX is hidden from the
      // as-planned station list (see selectAsPlannedStations). The demo seed is a
      // pure planning mission, so all seeded stations must remain visible.
      const mission = buildApollo14Mission();
      const visibleUuids = new Set(selectAsPlannedStations(mission).map((s) => s.uuid));
      for (const uuid of Object.keys(mission.stations)) {
        expect(visibleUuids.has(uuid), `Seeded station ${uuid} is hidden from planning`).toBe(true);
      }
    });
  });

  describe("apollo14Layers and apollo14Sublayers", () => {
    it("are non-empty", () => {
      expect(apollo14Layers.length).toBeGreaterThan(0);
      expect(apollo14Sublayers.length).toBeGreaterThan(0);
    });

    it("has sublayers with valid types and tile paths, all linked to a seeded layer", () => {
      const layerUuids = new Set(apollo14Layers.map((l) => l.uuid));
      for (const sublayer of apollo14Sublayers) {
        expect(VALID_SUBLAYER_TYPES).toContain(sublayer.type);
        expect(
          layerUuids.has(sublayer.layerUuid),
          `sublayer ${sublayer.uuid} references missing layer ${sublayer.layerUuid}`
        ).toBe(true);
        if (sublayer.type === "tile") {
          expect(sublayer.path.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("apollo14Preset", () => {
    // Flat list of every seeded layer/sublayer uuid.
    const layerUuids = new Set(apollo14Layers.map((l) => l.uuid));
    const sublayerUuids = new Set(apollo14Sublayers.map((s) => s.uuid));

    it("is the mission default with a placeholder missionId stamped at seed time", () => {
      expect(apollo14Preset.missionDefault).toBe(true);
      expect(apollo14Preset.missionId).toBe(1); // placeholder; the runner overrides with the assigned id
    });

    it("references only existing sublayers in its controls", () => {
      const controlKeys = Object.keys(apollo14Preset.mapSublayerControls);
      // A control exists for every seeded sublayer, and no control is dangling.
      expect(new Set(controlKeys)).toEqual(sublayerUuids);
      for (const [key, control] of Object.entries(apollo14Preset.mapSublayerControls)) {
        expect(control.sublayerUuid).toBe(key);
        expect(sublayerUuids.has(control.sublayerUuid)).toBe(true);
      }
    });

    it("has a layerOrder that references existing layers and sublayers", () => {
      for (const order of apollo14Preset.layerOrder) {
        expect(
          layerUuids.has(order.layerUuid),
          `layerOrder layerUuid ${order.layerUuid} is dangling`
        ).toBe(true);
        for (const sublayerUuid of order.sublayerUuids) {
          expect(
            sublayerUuids.has(sublayerUuid),
            `layerOrder sublayerUuid ${sublayerUuid} is dangling`
          ).toBe(true);
        }
      }
    });
  });
});
