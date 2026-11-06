vi.unmock("utils/validateSchemaServer");
import * as Automerge from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import { AUTOMERGE_MIGRATIONS } from "server/automerge/migrations";
import { Migration20261028000000 } from "server/automerge/migrations/Migration20261028000000";
import { Migration20261106000000 } from "server/automerge/migrations/Migration20261106000000";
import { generateBlankMission } from "store/storeUtils/mission";
import { missionValidator } from "utils/validateSchemaServer";

type LegacyGridMission = Omit<Mission, "planet"> & {
  planetRadius: number | null;
  gridSystem?: MissionGridSystemId;
  earthGridLabelScheme?: GridLabelScheme;
  usingLGRSCoordinates: boolean;
  gridRenderMode: "server-file" | "dynamic-lgrs";
};

const legacyMission = (planetRadius: number | null): LegacyGridMission => {
  const mission = {
    ...generateBlankMission(),
    planetRadius,
    usingLGRSCoordinates: false,
    gridRenderMode: "server-file" as const,
  };
  delete (mission as Partial<Mission>).planet;
  delete mission.earthGridLabelScheme;
  return mission;
};

const migrate = async (mission: LegacyGridMission): Promise<LegacyGridMission> => {
  let doc = Automerge.from({ ...mission });
  const handle = {
    change: (callback: (m: LegacyGridMission) => void) => {
      doc = Automerge.change(doc, callback);
    },
  } as unknown as DocHandle<Mission>;
  await Migration20261106000000.migrate(handle, null);
  return Automerge.toJS(doc);
};

describe("mission grid system migration", () => {
  it("is registered after the document history migration", () => {
    expect(AUTOMERGE_MIGRATIONS).toContain(Migration20261106000000);
    expect(AUTOMERGE_MIGRATIONS.indexOf(Migration20261106000000)).toBeGreaterThan(
      AUTOMERGE_MIGRATIONS.indexOf(Migration20261028000000)
    );
  });

  it.each([
    [1737400, "moon-m2025"],
    [1737000, "moon-m2025"],
    [null, "moon-m2025"],
    [4000000, "moon-m2025"],
    [4000001, "earth-wgs84"],
    [6371000, "earth-wgs84"],
    [6378137, "earth-wgs84"],
  ] as const)("sets radius %s to %s with the ACC label scheme", async (radius, gridSystem) => {
    const before = legacyMission(radius);
    const after = await migrate(before);
    expect(after).toEqual({ ...before, gridSystem, earthGridLabelScheme: "lunar-acc" });
    expect(missionValidator(after)).toBe(true);
  });

  it("keeps fields that are already set", async () => {
    const before = {
      ...legacyMission(6378137),
      gridSystem: "moon-m2025" as const,
      earthGridLabelScheme: "mgrs" as const,
    };
    expect(await migrate(before)).toEqual(before);

    const partial = legacyMission(1737400);
    partial.earthGridLabelScheme = "mgrs";
    expect(await migrate(partial)).toEqual({ ...partial, gridSystem: "moon-m2025" });
  });

  it("is idempotent", async () => {
    const once = await migrate(legacyMission(6371000));
    expect(await migrate(once)).toEqual(once);
  });

  it("accepts documents from before the migration", () => {
    expect(missionValidator(legacyMission(6371000))).toBe(true);
  });
});
