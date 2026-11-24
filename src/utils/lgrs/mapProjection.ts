/** The map CRS the app uses for a mission (mirrors `MapProvider` / `useCoordConverters`). */
export function getLgrsMapProjection(
  mission: Pick<Mission, "id" | "projIsCustom" | "projEpsg" | "projProj4String">
): LgrsMapProjection {
  if (mission.projIsCustom && mission.projProj4String && mission.projEpsg) {
    return {
      projCode:
        mission.projEpsg === "EPSG:3857" ? `AEGIS:${mission.id ?? "custom"}` : mission.projEpsg,
      proj4Def: mission.projProj4String,
    };
  }
  return { projCode: "EPSG:3857", proj4Def: null };
}
