type LgrsMapExtent = import("@bfeist/planetary-grid-reference").LgrsMapExtent;
type LgrsGridSpacing = import("@bfeist/planetary-grid-reference").LgrsGridSpacing;
type LgrsRenderCaps = import("@bfeist/planetary-grid-reference").LgrsRenderCaps;
type LgrsRenderOptions = import("@bfeist/planetary-grid-reference").LgrsRenderOptions;
type LgrsRenderTier = import("@bfeist/planetary-grid-reference").LgrsRenderTier;
type LgrsRenderLineKind = import("@bfeist/planetary-grid-reference").LgrsRenderLineKind;
type LgrsRenderLineAxis = import("@bfeist/planetary-grid-reference").LgrsRenderLineAxis;
type LgrsRenderLine = import("@bfeist/planetary-grid-reference").LgrsRenderLine;
type LgrsRenderLabel = import("@bfeist/planetary-grid-reference").LgrsRenderLabel;
type LgrsRenderPlan = import("@bfeist/planetary-grid-reference").LgrsRenderPlan;

/** Whether a mission can use the dynamic LGRS grid, with a reason the admin page can show. */
type LgrsCompatibility = {
  compatible: boolean;
  reason: string;
  /** The mission's map projection when it is compatible. */
  projection: LgrsMapProjection | null;
  /** A problem that does not block the dynamic grid, shown to admins; null when there is none. */
  warning: string | null;
};
