type LgrsCrsId = import("@bfeist/planetary-grid-reference").LgrsCrsId;
type LgrsHemisphere = import("@bfeist/planetary-grid-reference").LgrsHemisphere;
type LgrsPrecision = import("@bfeist/planetary-grid-reference").LgrsPrecision;
type LgrsStringKind = import("@bfeist/planetary-grid-reference").LgrsStringKind;
type GridLabelScheme = import("@bfeist/planetary-grid-reference").GridLabelScheme;
type MissionGridSystemId = import("@bfeist/planetary-grid-reference").MissionGridSystemId;
type LgrsCoordinate = import("@bfeist/planetary-grid-reference").LgrsCoordinate;
type LgrsExtent = import("@bfeist/planetary-grid-reference").LgrsExtent;
type LgrsLabel = import("@bfeist/planetary-grid-reference").LgrsLabel;
type LgrsMapProjection = import("@bfeist/planetary-grid-reference").LgrsMapProjection;
type LgrsMapFastPath = import("@bfeist/planetary-grid-reference").LgrsMapFastPath;
type LgrsMapAffine = import("@bfeist/planetary-grid-reference").LgrsMapAffine;
type LgrsMapProjector = import("@bfeist/planetary-grid-reference").LgrsMapProjector;
type LgrsGridBinding = import("@bfeist/planetary-grid-reference").LgrsGridBinding;
type LgrsCap = import("@bfeist/planetary-grid-reference").LgrsCap;
type LgrsFrameworkLine = import("@bfeist/planetary-grid-reference").LgrsFrameworkLine;
type LgrsZoneLabel = import("@bfeist/planetary-grid-reference").LgrsZoneLabel;
type LgrsGridSystem = import("@bfeist/planetary-grid-reference").LgrsGridSystem;
type LgrsDisplayStyle = import("@bfeist/planetary-grid-reference").LgrsDisplayStyle;

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
