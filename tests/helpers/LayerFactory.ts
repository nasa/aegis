import { Factory } from "@mikro-orm/seeder";
import { v4 } from "uuid";
import { Layer } from "../../server/database/models/layer.model";

export default class LayerFactory extends Factory<Layer> {
  model = Layer;
  definition(): Object {
    return {
      uuid: v4(),
      mission: 1,
      config: {
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
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
