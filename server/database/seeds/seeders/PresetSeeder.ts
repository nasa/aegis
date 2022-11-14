import { Seeder } from "@mikro-orm/seeder";
import { Dictionary, EntityManager } from "@mikro-orm/core";
import { Preset } from "../../models/preset.model";

export class PresetSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    em.create(Preset, {
      layer: context.layer6.uuid,
      owner: context.user1.id,
      config: {
        id: 1,
        sublayer: 1,
        opacity: 1,
        brightness: 0,
        contrast: 0,
        saturation: 0,
        blend: "normal",
      },
    });
  }
}
