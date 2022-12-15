import { Seeder } from "@mikro-orm/seeder";
import { Dictionary, EntityManager } from "@mikro-orm/core";
import { Preset } from "../../models/preset.model";

export class PresetSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    em.create(Preset, {
      owner: context.user1.id,
      mission: context.mission1.id,
      name: "Terrain Whiteout",
      description: "",
      uuid: "d9f9b0b0-5b1f-11ec-8d3d-0242ac130003",
      layerControls: {
        Basemaps: {
          name: "Basemaps",
          type: "header",
          style: null,
          enabled: false,
          expanded: true,
          mapLayerRef: null,
        },
        Hillshade: {
          name: "Hillshade",
          type: "header",
          style: null,
          enabled: false,
          expanded: false,
          mapLayerRef: null,
        },
        Traverses: {
          name: "Traverses",
          type: "header",
          style: null,
          enabled: false,
          expanded: false,
          mapLayerRef: null,
        },
        "Confidence Map": {
          name: "Confidence Map",
          type: "header",
          style: null,
          enabled: false,
          expanded: false,
          mapLayerRef: null,
        },
        "NAC DTM DTR 2m ": {
          name: "NAC DTM DTR 2m ",
          type: "tile",
          style: null,
          enabled: false,
          expanded: false,
          mapLayerRef: null,
        },
        "Sample Stations": {
          name: "Sample Stations",
          type: "header",
          style: null,
          enabled: false,
          expanded: false,
          mapLayerRef: null,
        },
        "Apollo 14 Traverse": {
          name: "Apollo 14 Traverse",
          type: "vector",
          style: null,
          enabled: false,
          expanded: false,
          mapLayerRef: null,
        },
        "Detrended Roughness": {
          name: "Detrended Roughness",
          type: "header",
          style: null,
          enabled: false,
          expanded: false,
          mapLayerRef: null,
        },
        "NAC DTM 2m Hillshade": {
          name: "NAC DTM 2m Hillshade",
          type: "tile",
          style: null,
          enabled: false,
          expanded: false,
          mapLayerRef: null,
        },
        "Apollo 14 Sample Stations": {
          name: "Apollo 14 Sample Stations",
          type: "vector",
          style: null,
          enabled: false,
          expanded: false,
          mapLayerRef: null,
        },
        "NAC DTM 2m Confidence Map": {
          name: "NAC DTM 2m Confidence Map",
          type: "tile",
          style: null,
          enabled: false,
          expanded: false,
          mapLayerRef: null,
        },
        "NAC Ortho 50cm M150633128": {
          name: "NAC Ortho 50cm M150633128",
          type: "tile",
          style: null,
          enabled: true,
          expanded: false,
          mapLayerRef: null,
        },
        "NAC Ortho 50cm M150639913": {
          name: "NAC Ortho 50cm M150639913",
          type: "tile",
          style: null,
          enabled: false,
          expanded: false,
          mapLayerRef: null,
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
