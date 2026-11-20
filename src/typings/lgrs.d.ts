type LgrsCrsId = import("@bfeist/planetary-grid-reference").LgrsCrsId;
type LgrsPrecision = import("@bfeist/planetary-grid-reference").LgrsPrecision;
type GridLabelScheme = import("@bfeist/planetary-grid-reference").GridLabelScheme;
type MissionGridSystemId = import("@bfeist/planetary-grid-reference").MissionGridSystemId;
type LgrsMapProjection = import("@bfeist/planetary-grid-reference").LgrsMapProjection;
type LgrsMapProjector = import("@bfeist/planetary-grid-reference").LgrsMapProjector;
type LgrsGridBinding = import("@bfeist/planetary-grid-reference").LgrsGridBinding;
type LgrsGridSystem = import("@bfeist/planetary-grid-reference").LgrsGridSystem;
type LgrsDisplayStyle = import("@bfeist/planetary-grid-reference").LgrsDisplayStyle;

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
