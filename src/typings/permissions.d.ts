/**
 * Mission permission levels, ordered as a pyramid: each permission level includes everything below it.
 */
type PermissionLevel = "edit" | "editPartial" | "viewer";

/** Where a user's effective permission level on a mission came from. */
type PermissionSource = "direct" | "group" | "public";

/**
 * One reason a user can reach a mission: a direct grant, one group they belong to, or the public
 * baseline. A user can hold several at once on the same mission.
 */
interface MissionAccessContribution {
  source: PermissionSource;
  permLevel: PermissionLevel;
  /** Populated when `source` is "group". */
  groupId?: number;
  groupName?: string;
  notes?: string | null;
  /** True for the contribution that wins the max, which is the level actually enforced. */
  isEffective: boolean;
}

/**
 * A mission a user can reach, with every contributing permission.
 */
interface ResolvedMissionAccess {
  missionId: number;
  /** The highest level across all contributions. This is what is enforced. */
  effectivePermLevel: PermissionLevel;
  contributions: MissionAccessContribution[];
}

/**
 * The user's resolved identity and access for api requests.
 * Attached to the request object by the authMiddleware.ts middleware.
 */
interface CurrentUser {
  /** Null for a machine-to-machine caller authenticating with the EMSS token. */
  launchpadUser: LaunchpadUser | null;
  /** The record stored in the database */
  appUser: AppUser | null;
  /**
   * missionId to resolved permission level, already including the public baseline. Empty for a super user.
   * Keyed by string (not number) so this survives JSON serialization over the REST API unchanged.
   */
  permissions: Record<string, PermissionLevel>;
  /** EMSS token for machine to machine bypass. Token is already validated */
  isEmssToken: boolean;
}

/** A user or group holding a grant on a given mission. */
interface MissionAccessSubject {
  subjectType: "user" | "group";
  subjectId: number;
  subjectName: string;
  /** AUID of a user subject. Absent for a group. */
  subjectAuid?: string;
  permLevel: PermissionLevel;
  notes: string | null;
  grantedBy: number | null;
  /** For a group subject, the members who reach the mission through it. */
  members?: { id: number; displayName: string; auid: string }[];
}

/** Everyone who can reach one mission, and whether the public baseline applies to it. */
interface MissionAccessSummary {
  subjects: MissionAccessSubject[];
  /** True when the reserved Public user holds a grant, making the mission visible to everyone. */
  isPublic: boolean;
  /** The reserved Public user's row id, so the admin UI can toggle the grant without a lookup. */
  publicUserId: number | null;
}

/** A mission the Public user can reach, for the public-missions admin view. */
interface PublicMission {
  missionId: number;
  notes: string | null;
}

/**
 * Every Launchpad identity that has authenticated at least once, plus the reserved Public user.
 * A row exists from first login onward regardless of whether the user holds any permission, so
 * `id` is stable and safe to reference as `ownerId`. Identity fields mirror the Launchpad token.
 */
interface AppUser {
  id: number;
  /** Launchpad stable identifier. `__public__` for the reserved Public user. */
  uupic: string;
  auid: string;
  displayName: string;
  /** True only for reserved rows the application depends on (currently just Public). */
  isSystem: boolean;
  lastLoginAt: number;
}

/**
 * User list row with the counts the admin grid shows. `hasPermissions` is derived rather than
 * stored: a row exists for everyone who has logged in, so it is the counts that distinguish a
 * user with permissions from one who has merely visited.
 */
interface AppUserSummary extends AppUser {
  groupCount: number;
  missionCount: number;
  /** True when the user holds at least one grant or membership, or is reserved. */
  hasPermissions: boolean;
}

/** A named collection of users that can be granted missions as a unit. */
interface UserGroup {
  id: number;
  name: string;
  description: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Group list row with the counts the admin grid shows. */
interface UserGroupSummary extends UserGroup {
  memberCount: number;
  missionCount: number;
}

type UserGroupMember = {
  id: number;
  groupId: number;
  userId: number;
  createdAt: number;
  updatedAt: number;
};

/** A single permission grant for a mission */
interface MissionPermission {
  id: number;
  missionId: number;
  userId: number | null;
  groupId: number | null;
  permLevel: PermissionLevel;
  notes: string | null;
  grantedBy: number | null;
  createdAt: number;
  updatedAt: number;
}
