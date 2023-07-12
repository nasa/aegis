/**
 * This file contains functions designed to port data from old data structures to new ones as the database schema changes.
 * As all environments' databases are migrated, these functions can slowly be removed.
 */

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
