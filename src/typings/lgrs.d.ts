/** A mission's resolved grid system and whether its dynamic grid can be drawn. */
type LgrsMissionGridSystem = {
  system: LgrsGridSystem | null;
  compatibility: LgrsCompatibility;
};

/** Mission fields that select its grid system and default label scheme. */
type LgrsMissionGridSelection = Pick<Mission, "planet" | "earthGridLabelScheme">;

/** Mission fields that select and gate its grid system. */
type LgrsMissionGridFields = LgrsMissionGridSelection &
  Pick<Mission, "id" | "projIsCustom" | "projEpsg" | "projProj4String">;
