/**
 * This file contains functions designed to port data from old data structures to new ones as the database schema changes.
 * As all environments' databases are migrated, these functions can slowly be removed.
 */

import { upsertLayer } from "http-client/layer";
import { upsertSublayer } from "http-client/sublayer";
import _ from "lodash";

export function convertMapControls(oldMapControls: MapSublayerControls): MapSublayerControls {
  //take in map controls that are indexed by name and convert to be indexed by uuid
  const newMapControls: MapSublayerControls = {};
  for (const keyValue of Object.entries(oldMapControls)) {
    const newMapControl = convertMapControl(keyValue[1]); //convert each map control
    newMapControls[newMapControl.sublayerUuid] = newMapControl; //index by uuid
  }

  return newMapControls;
}

type OldMapControl = {
  name: string;
  uuid?: string;
  sublayerUuid?: string;
  visible?: boolean;
  enabled?: boolean;
  style: MapSublayerStyle;
};

/**
 * Various conversion tasks to bring old typed version of map control to the updated type
 * @param oldMapControl
 */
export function convertMapControl(oldMapControl: OldMapControl): MapSublayerControl {
  const newMapControl: MapSublayerControl = {
    name: oldMapControl.name,
    sublayerUuid: oldMapControl.uuid || oldMapControl.sublayerUuid, //rename uuid to sublayerUuid
    visible: oldMapControl.enabled || oldMapControl.visible, //rename the "enabled" property to "visible".
    style: oldMapControl.style,
  };

  return newMapControl;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export async function convertLayers(oldLayer: Layer): Promise<void> {
  //update layers object
  const newLayer: Layer = {
    uuid: oldLayer.uuid,
    missionId: oldLayer.missionId,
    layerConfig: oldLayer.layerConfig,
    name: oldLayer.layerConfig.name,
    createdAt: oldLayer.createdAt,
    updatedAt: oldLayer.updatedAt,
  };
  //upsert to db
  const upsertRes = await upsertLayer(newLayer);
  if (upsertRes.status !== "success") {
    throw new Error("Error upserting Layers: " + upsertRes.message);
  }

  //pull out sublayers from config
  for (const oldSublayer of oldLayer.layerConfig.sublayers) {
    const newSublayer: Sublayer = {
      uuid: oldSublayer.uuid,
      missionId: oldLayer.missionId,
      layerUuid: oldLayer.uuid,
      name: oldSublayer.name,
      description: oldSublayer.description,
      type: oldSublayer.type,
      url: oldSublayer.aegisURL,
      filePath: oldSublayer.type === "vector" ? oldSublayer.url : null, // for vector layers
      boundingBox: oldSublayer.boundingBox,
      tileFormat: oldSublayer.tileformat,
      minZoom: oldSublayer.minZoom,
      maxNativeZoom: oldSublayer.maxNativeZoom,
      maxZoom: oldSublayer.maxZoom,
      color: oldSublayer.style?.color,
      opacity: oldSublayer.style?.opacity,
      fillColor: oldSublayer.style?.fillColor,
      fillOpacity: oldSublayer.style?.fillOpacity,
      weight: oldSublayer.style?.weight,
      createdAt: oldLayer.createdAt,
      updatedAt: oldLayer.updatedAt,
    };
    const upsertSublayerRes = await upsertSublayer(newSublayer);
    if (upsertSublayerRes.status !== "success") {
      throw new Error("Error upserting Sublayer: " + upsertSublayerRes.message);
    }
  }
}

export const portMissionFromMMGISFormat = (mission: Mission): Mission => {
  const newMission = { ...mission };
  newMission.planetRadius = +mission.config.msv.radius.major;
  newMission.initialZoom = +mission.config.msv.view[2];

  const measureJson = mission.config.tools.find((tool) => tool.name === "Measure")?.variables;
  newMission.demFilePath = measureJson.dem;
  newMission.demResolution = +measureJson.resolution;

  newMission.projIsCustom = mission.config.projection.custom;
  newMission.projEpsg = mission.config.projection.epsg;
  newMission.projProj4String = mission.config.projection.proj;
  newMission.projBoundsMinX = +mission.config.projection.bounds[0];
  newMission.projBoundsMinY = +mission.config.projection.bounds[1];
  newMission.projBoundsMaxX = +mission.config.projection.bounds[2];
  newMission.projBoundsMaxY = +mission.config.projection.bounds[3];
  newMission.projOriginX = +mission.config.projection.origin[0];
  newMission.projOriginY = +mission.config.projection.origin[1];
  newMission.projResZoomLevel = +mission.config.projection.reszoomlevel;
  newMission.projResUnitsPerPixel = +mission.config.projection.resunitsperpixel;

  return newMission;
};
