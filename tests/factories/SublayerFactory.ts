import { EntityData } from "@mikro-orm/core";
import { Factory } from "@mikro-orm/seeder";
import { v4 } from "uuid";
import { Sublayer as Sublayer_db } from "server/database/models/sublayer.model";

export default class SublayerFactory extends Factory<Sublayer_db> {
  model = Sublayer_db;
  definition(): EntityData<Sublayer_db> {
    return {
      uuid: v4(),
      mission: null,
      layer: null,
      name: "Jest Test Sublayer",
      description: "",
      url: "",
      type: "tile",
      filePath: "",
      boundingBox: null,
      tileFormat: null,
      minZoom: 0,
      maxNativeZoom: 0,
      maxZoom: 0,
      color: "",
      opacity: 0,
      fillColor: "",
      fillOpacity: 0,
      weight: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
