/** A mission's resolved grid system and whether its dynamic grid can be drawn. */
type LgrsMissionGridSystem = {
  system: LgrsGridSystem;
  compatibility: LgrsCompatibility;
};

/** Mission fields that select its grid system and default label scheme. */
type LgrsMissionGridSelection = Partial<Pick<Mission, "gridSystem" | "earthGridLabelScheme">>;

/** Mission fields that select and gate its grid system. */
type LgrsMissionGridFields = LgrsMissionGridSelection &
  Pick<Mission, "id" | "planetRadius" | "projIsCustom" | "projEpsg" | "projProj4String">;
