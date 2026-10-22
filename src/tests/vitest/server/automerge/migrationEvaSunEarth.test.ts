import * as Automerge from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import { Migration20261022000000 } from "server/automerge/migrations/Migration20261022000000";
import { AUTOMERGE_MIGRATIONS } from "server/automerge/migrations";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankMission } from "store/storeUtils/mission";
import { missionValidator } from "utils/validateSchemaServer";

const fields = ["sunEarthFromDate", "sunAzimuth", "earthAzimuth"] as const;

describe("EVA Sun/Earth migration", () => {
  it("is registered after existing migrations", () => {
    const index = AUTOMERGE_MIGRATIONS.indexOf(Migration20261022000000);
    expect(index).toBeGreaterThan(0);
    expect(AUTOMERGE_MIGRATIONS[index - 1].version).toBe(20261015000000);
  });

  it.each([1737400, 6371000])(
    "backfills required fields at radius %s without overwriting saved values",
    async (planetRadius) => {
      const legacy = generateBlankEVA({ uuid: "legacy" });
      for (const field of fields) delete (legacy as Partial<Eva>)[field];
      const partial = generateBlankEVA({
        uuid: "partial",
        sunEarthFromDate: false,
        sunAzimuth: 123,
      });
      delete (partial as Partial<Eva>).earthAzimuth;
      const manual = generateBlankEVA({
        uuid: "manual",
        sunEarthFromDate: false,
        sunAzimuth: 0,
        earthAzimuth: 234,
      });
      let doc = Automerge.from({
        ...generateBlankMission({ planetRadius, evas: { legacy, partial, manual } }),
      });
      const before = Automerge.toJS(doc);
      expect(missionValidator(before)).toBe(false);
      expect(missionValidator.errors).toEqual(
        expect.arrayContaining(
          fields.map((field) =>
            expect.objectContaining({ keyword: "required", params: { missingProperty: field } })
          )
        )
      );
      const handle = {
        change: (callback: (m: Mission) => void) => {
          doc = Automerge.change(doc, callback);
        },
      } as DocHandle<Mission>;
      await Migration20261022000000.migrate(handle, null);
      expect(missionValidator(Automerge.toJS(doc))).toBe(true);
      expect(doc.evas.legacy).toEqual({
        ...before.evas.legacy,
        sunEarthFromDate: true,
        sunAzimuth: 0,
        earthAzimuth: 0,
      });
      expect(doc.evas.partial).toEqual({ ...before.evas.partial, earthAzimuth: 0 });
      expect(doc.evas.manual).toEqual(before.evas.manual);
      const heads = Automerge.getHeads(doc);
      await Migration20261022000000.migrate(handle, null);
      expect(Automerge.getHeads(doc)).toEqual(heads);
      expect(Automerge.load<Mission>(Automerge.save(doc)).evas).toEqual(doc.evas);
    }
  );

  it("handles a mission with no EVAs", async () => {
    let doc = Automerge.from({ ...generateBlankMission() });
    const heads = Automerge.getHeads(doc);
    const handle = {
      change: (callback: (m: Mission) => void) => {
        doc = Automerge.change(doc, callback);
      },
    } as DocHandle<Mission>;
    await Migration20261022000000.migrate(handle, null);
    expect(Automerge.getHeads(doc)).toEqual(heads);
  });
});
