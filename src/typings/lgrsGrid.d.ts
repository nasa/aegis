/** Whether a mission can use the dynamic LGRS grid, with a reason the admin page can show. */
type LgrsCompatibility = {
  compatible: boolean;
  reason: string;
  /** The mission's map projection when it is compatible. */
  projection: LgrsMapProjection | null;
  /** A problem that does not block the dynamic grid, shown to admins; null when there is none. */
  warning: string | null;
};
