import { EntityData } from "@mikro-orm/core";
import { Factory } from "@mikro-orm/seeder";
import { v4 } from "uuid";
import { Layer as Layer_db } from "server/database/models/layer.model";

export default class LayerFactory extends Factory<Layer_db> {
  model = Layer_db;
  definition(): EntityData<Layer_db> {
    return {
      uuid: v4(),
      mission: null,
      layerConfig: {
        name: "Basemaps",
        type: "header",
        demparser: "",
        controlled: false,
        tileformat: "tms",
        initialOpacity: 1,
        time: {
          enabled: false,
          type: "global",
          isRelative: true,
          current: new Date("2022-05-17T18:39:14Z"),
          start: "",
          end: "",
          format: "%Y-%m-%dT%H:%M:%SZ",
          refresh: "1 hours",
          increment: "5 minutes",
        },
        shape: "none",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
