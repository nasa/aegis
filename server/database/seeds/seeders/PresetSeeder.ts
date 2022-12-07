import { Seeder } from "@mikro-orm/seeder";
import { Dictionary, EntityManager } from "@mikro-orm/core";
import { Preset } from "../../models/preset.model";

export class PresetSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    em.create(Preset, {
      owner: context.user1.id,
      name: "Terrain Whiteout",
      mission: context.mission1.id,
      config: [
        {
          layer_id: context.layer6,
          sublayer_id: 1,
          opacity: 1,
          brightness: 0,
          contrast: 0,
          saturation: 0,
          blend: "normal",
        },
        {
          layer_id: context.layer6,
          sublayer_id: 2,
          opacity: 1,
          brightness: 0,
          contrast: 0,
          saturation: 0,
          blend: "normal",
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
