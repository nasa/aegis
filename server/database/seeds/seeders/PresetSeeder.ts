import { Seeder } from "@mikro-orm/seeder";
import { Dictionary, EntityManager } from "@mikro-orm/core";
import { Preset } from "../../models/preset.model";
import { v4 as uuidv4 } from "uuid";

export class PresetSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    em.create(Preset, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      name: "Visible Light",
      description: "",
      missionPreset: true,
      missionPresetDefault: true,
      mapLayerControls: {
        Basemaps: {
          name: "Basemaps",
          type: "header",
          style: null,
          enabled: false,
          expanded: true,
        },
        Hillshade: {
          name: "Hillshade",
          type: "header",
          style: null,
          enabled: false,
          expanded: false,
        },
        Traverses: {
          name: "Traverses",
          type: "header",
          style: null,
          enabled: false,
          expanded: false,
        },
        "Confidence Map": {
          name: "Confidence Map",
          type: "header",
          style: null,
          enabled: false,
          expanded: false,
        },
        "NAC DTM DTR 2m ": {
          name: "NAC DTM DTR 2m ",
          type: "tile",
          style: null,
          enabled: false,
          expanded: false,
        },
        "Sample Stations": {
          name: "Sample Stations",
          type: "header",
          style: null,
          enabled: false,
          expanded: false,
        },
        "Apollo 14 Traverse": {
          name: "Apollo 14 Traverse",
          type: "vector",
          style: null,
          enabled: false,
          expanded: false,
        },
        "Detrended Roughness": {
          name: "Detrended Roughness",
          type: "header",
          style: null,
          enabled: false,
          expanded: false,
        },
        "NAC DTM 2m Hillshade": {
          name: "NAC DTM 2m Hillshade",
          type: "tile",
          style: null,
          enabled: false,
          expanded: false,
        },
        "Apollo 14 Sample Stations": {
          name: "Apollo 14 Sample Stations",
          type: "vector",
          style: null,
          enabled: false,
          expanded: false,
        },
        "NAC DTM 2m Confidence Map": {
          name: "NAC DTM 2m Confidence Map",
          type: "tile",
          style: null,
          enabled: false,
          expanded: false,
        },
        "NAC Ortho 50cm M150633128": {
          name: "NAC Ortho 50cm M150633128",
          type: "tile",
          style: null,
          enabled: true,
          expanded: false,
        },
        "NAC Ortho 50cm M150639913": {
          name: "NAC Ortho 50cm M150639913",
          type: "tile",
          style: null,
          enabled: false,
          expanded: false,
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
