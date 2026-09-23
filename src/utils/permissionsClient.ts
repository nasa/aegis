/**
 * Permission level helpers. This module must stay free of server-only imports so it
 * can be used from both the browser bundle and the API.
 */

/** Numeric rank of each permission level. Higher wins. Mirrored by the SQL `case` in the access resolver. */
export const PERMISSION_RANK: Record<PermissionLevel, number> = {
  viewer: 1,
  editPartial: 2,
  edit: 3,
};

/** Every permission level, weakest first. */
export const PERMISSION_LEVELS: PermissionLevel[] = ["viewer", "editPartial", "edit"];

/** Sentinel uupic of the reserved Public user. Cannot collide with a real Launchpad uupic. */
export const PUBLIC_UUPIC = "__public__";

/**
 * NAMS roles that confer super-user access: implicit edit on every mission plus access to every
 * admin page. The role arrives on the Launchpad token, so nothing is stored or seeded for it.
 */
const SUPER_USER_ROLES: EMSSRole[] = ["AEGIS-Superuser", "EMSS-Superuser"];

/**
 * Does the Launchpad token carry a super-user role?
 *
 * `roles` may be a bare string rather than an array, so it is normalized first — comparing against
 * an unnormalized string would substring-match and accept roles that merely contain one of these.
 */
export const isLaunchpadSuperUser = (user: LaunchpadUser | null | undefined): boolean => {
  const roles = user?.roles;
  if (!roles) return false;
  const roleList = Array.isArray(roles) ? roles : [roles];
  return SUPER_USER_ROLES.some((role) => roleList.includes(role));
};

/** Does `actual` satisfy `required`, given the pyramid? */
export const meetsPermLevel = (
  actual: PermissionLevel | null | undefined,
  required: PermissionLevel
): boolean => !!actual && PERMISSION_RANK[actual] >= PERMISSION_RANK[required];

/** Human-readable label for a permission level, for admin UI selectors. */
export const permissionLevelLabel = (level: PermissionLevel): string => {
  switch (level) {
    case "edit":
      return "Edit";
    case "editPartial":
      return "Edit Partial";
    case "viewer":
      return "Viewer";
  }
};
