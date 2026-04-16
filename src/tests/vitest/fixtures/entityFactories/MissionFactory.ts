import type { EntityManager } from "@mikro-orm/postgresql";

import { MissionBackup_db } from "server/database/models/_allModels";
import { generateBlankMission } from "store/storeUtils/mission";
import DocListingFactory from "./DocListingFactory";

export default class MissionFactory {
  constructor(private em: EntityManager) {}

  async createOne(): Promise<MissionBackup_db> {
    const docListing = await new DocListingFactory(this.em).createOne();
    const missionId = docListing.missionId;
    const data = generateBlankMission({ name: "Vitest Mission-1", id: missionId });
    const backup = this.em.create(MissionBackup_db, { missionId, data });
    await this.em.persistAndFlush(backup);
    return backup;
  }

  async create(count: number): Promise<MissionBackup_db[]> {
    const results: MissionBackup_db[] = [];
    for (let i = 0; i < count; i++) {
      results.push(await this.createOne());
    }
    return results;
  }
}
