import { EntityData } from "@mikro-orm/core";
import { Factory } from "@mikro-orm/seeder";
import { v4 } from "uuid";
import { Layer_db } from "server/database/models/_allModels";

export default class LayerFactory extends Factory<Layer_db> {
  model = Layer_db;
  definition(): EntityData<Layer_db> {
    return {
      uuid: v4(),
      mission: null,
      name: "Jest Test Layer",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
