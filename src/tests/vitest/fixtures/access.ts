import type { EntityManager } from "@mikro-orm/postgresql";

import {
  App_User_db,
  Doc_Listing_db,
  Mission_Permission_db,
  User_Group_db,
  User_Group_Member_db,
} from "server/database/models/_allModels";
import { OVERRIDE_MOCK_ROLES_HEADER, OVERRIDE_MOCK_UUPIC_HEADER } from "packages/getUser";
import { PUBLIC_UUPIC } from "utils/permissionsClient";

/**
 * Helpers for building identities and grants in the test database.
 *
 * Requests authenticate through the mock-user override headers rather than a login call, since the
 * password login is gone and identity now comes from the oauth2-proxy token.
 */

/**
 * Headers that authenticate as a specific identity holding no NAMS roles.
 *
 * The default mock user is a super user, which passes every permission check, so any test that
 * means to exercise grants has to strip the roles.
 */
export const asUser = (uupic: string): Record<string, string> => ({
  [OVERRIDE_MOCK_UUPIC_HEADER]: uupic,
  [OVERRIDE_MOCK_ROLES_HEADER]: "",
});

/** Headers that authenticate as a specific identity holding the super-user role. */
export const asSuperUser = (uupic: string): Record<string, string> => ({
  [OVERRIDE_MOCK_UUPIC_HEADER]: uupic,
  [OVERRIDE_MOCK_ROLES_HEADER]: "AEGIS-Superuser",
});

/**
 * Headers for a caller who holds nothing at all: no roles and no grants.
 *
 * Under MOCK_USER there is no unauthenticated request — every call resolves to an identity — so
 * this is the closest equivalent, and it is what the authorization-failure cases need.
 */
export const asNobody = (): Record<string, string> => asUser("vitest-nobody");

/** Create (or reuse) a user row. */
export const upsertAppUser = async (
  em: EntityManager,
  uupic: string,
  overrides: Partial<{ auid: string; displayName: string }> = {}
): Promise<App_User_db> => {
  const existing = await em.findOne(App_User_db, { uupic });
  if (existing) return existing;

  const user = em.create(App_User_db, {
    uupic,
    auid: overrides.auid ?? uupic,
    displayName: overrides.displayName ?? uupic,
    isSystem: false,
    lastLoginAt: Date.now(),
  });
  await em.flush();
  return user;
};

/** Create (or reuse) a group. */
export const upsertGroup = async (em: EntityManager, name: string): Promise<User_Group_db> => {
  const existing = await em.findOne(User_Group_db, { name });
  if (existing) return existing;

  const now = Date.now();
  const group = em.create(User_Group_db, {
    name,
    description: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
  });
  await em.flush();
  return group;
};

export const upsertUserToGroup = async (
  em: EntityManager,
  groupId: number,
  userId: number
): Promise<void> => {
  const existing = await em.findOne(User_Group_Member_db, { groupId, userId });
  if (existing) return;

  const now = Date.now();
  em.create(User_Group_Member_db, { groupId, userId, createdAt: now, updatedAt: now });
  await em.flush();
};

/**
 * Ensure a doc listing row exists for a mission id. Or create one in db_doc_listing
 * if it doesn't exist
 */
export const upsertMission = async (em: EntityManager, missionId: number): Promise<void> => {
  const existing = await em.findOne(Doc_Listing_db, { missionId });
  if (existing) return;

  // missionId is auto-increment, so the value has to be forced rather than assigned.
  await em.getConnection().execute(
    `insert into doc_listing_db (mission_id, automerge_url, version) values (?, null, 1)
       on conflict (mission_id) do nothing`,
    [missionId]
  );
};

/** Grant mission permissions to a user or a group. */
export const grantMissionPerms = async (
  em: EntityManager,
  args: {
    missionId: number;
    userId?: number;
    groupId?: number;
    permLevel: PermissionLevel;
    notes?: string | null;
  }
): Promise<Mission_Permission_db> => {
  const now = Date.now();
  const created = em.create(Mission_Permission_db, {
    missionId: args.missionId,
    userId: args.userId ?? null,
    groupId: args.groupId ?? null,
    permLevel: args.permLevel,
    notes: args.notes ?? null,
    grantedBy: null,
    createdAt: now,
    updatedAt: now,
  });
  await em.flush();
  return created;
};

/** The reserved Public user, created on demand when a test database lacks it. */
export const upsertPublicUser = async (em: EntityManager): Promise<App_User_db> => {
  const existing = await em.findOne(App_User_db, { uupic: PUBLIC_UUPIC });
  if (existing) return existing;

  const user = em.create(App_User_db, {
    uupic: PUBLIC_UUPIC,
    auid: "public",
    displayName: "Public",
    isSystem: true,
    lastLoginAt: Date.now(),
  });
  await em.flush();
  return user;
};
