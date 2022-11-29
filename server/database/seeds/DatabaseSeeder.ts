import type { EntityManager } from "@mikro-orm/core";
import { Seeder } from "@mikro-orm/seeder";
import { UserSeeder } from "./seeders/UserSeeder";
import { MissionSeeder } from "./seeders/MissionSeeder";
import { LayerSeeder } from "./seeders/LayerSeeder";
import { PresetSeeder } from "./seeders/PresetSeeder";
import { PoiSeeder } from "./seeders/PoiSeeder";
import { ActionSeeder } from "./seeders/ActionSeeder";
import { STMSeeder } from "./seeders/STMSeeder";
export class DatabaseSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    return this.call(em, [
      UserSeeder,
      MissionSeeder,
      LayerSeeder,
      PresetSeeder,
      STMSeeder,
      PoiSeeder,
      ActionSeeder,
    ]);
  }
}
