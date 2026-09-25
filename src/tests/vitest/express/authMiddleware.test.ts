import { MikroORM } from "@mikro-orm/postgresql";

import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import {
  App_User_db,
  Doc_Listing_db,
  Mission_Permission_db,
  User_Group_db,
  User_Group_Member_db,
} from "server/database/models/_allModels";
import { recordLogin, resolvePermissions } from "server/express/authMiddleware";
import DocListingFactory from "../fixtures/entityFactories/DocListingFactory";
import {
  upsertUserToGroup,
  upsertAppUser,
  upsertGroup,
  upsertPublicUser,
  grantMissionPerms,
} from "../fixtures/access";

const UUPIC = "vitest-user";
const GROUP_NAME = "vitest-group";

let missions: Doc_Listing_db[];

beforeAll(async () => {
  globalValues.orm = await MikroORM.init(config);
  const em = globalValues.orm.em.fork();
  missions = await new DocListingFactory(em).create(3);
});

describe("recordLogin", () => {
  it("creates a row on first sight and refreshes it afterwards", async () => {
    const em = globalValues.orm.em.fork();

    const first = await recordLogin(em, { uupic: UUPIC, auid: "auid1", displayName: "Name 1" });
    expect(first).not.toBeNull();
    expect(first.auid).toEqual("auid1");

    // A repeated request refreshes rather than duplicates.
    const second = await recordLogin(em, { uupic: UUPIC, auid: "auid2", displayName: "Name 2" });
    expect(second.id).toEqual(first.id);
    expect(second.auid).toEqual("auid2");
    expect(second.displayName).toEqual("Name 2");

    expect(await em.count(App_User_db, { uupic: UUPIC })).toBe(1);
  });

  it("keeps the row id stable across a grant being added and removed", async () => {
    const em = globalValues.orm.em.fork();

    const user = await recordLogin(em, { uupic: UUPIC, auid: "auid2", displayName: "Name 2" });
    const originalId = user.id;

    await grantMissionPerms(em, {
      missionId: missions[0].missionId,
      userId: user.id,
      permLevel: "viewer",
    });
    await em.nativeDelete(Mission_Permission_db, { userId: user.id });

    // Stability is what makes the id safe to use as ownerId on entities the user creates.
    const after = await recordLogin(em, { uupic: UUPIC, auid: "auid2", displayName: "Name 2" });
    expect(after.id).toEqual(originalId);
  });

  it("leaves a user in place when their group is deleted", async () => {
    const em = globalValues.orm.em.fork();

    const user = await em.findOne(App_User_db, { uupic: UUPIC });
    const group = await upsertGroup(em, GROUP_NAME);
    await upsertUserToGroup(em, group.id, user.id);

    await em.nativeDelete(User_Group_db, { id: group.id });

    expect(await em.count(App_User_db, { id: user.id })).toBe(1);
    expect(await em.count(User_Group_Member_db, { userId: user.id })).toBe(0);
  });
});

describe("resolveGrants", () => {
  it("returns the highest level across direct, group, and public grants", async () => {
    const em = globalValues.orm.em.fork();

    const user = await em.findOne(App_User_db, { uupic: UUPIC });
    const publicUser = await upsertPublicUser(em);
    const group = await upsertGroup(em, GROUP_NAME);
    await upsertUserToGroup(em, group.id, user.id);

    for (const mission of missions) {
      await em.nativeDelete(Mission_Permission_db, { missionId: mission.missionId });
    }

    // Mission 0: direct edit and a weaker group grant. Highest wins.
    await grantMissionPerms(em, {
      missionId: missions[0].missionId,
      userId: user.id,
      permLevel: "edit",
    });
    await grantMissionPerms(em, {
      missionId: missions[0].missionId,
      groupId: group.id,
      permLevel: "viewer",
    });

    // Mission 1: reachable only through the group.
    await grantMissionPerms(em, {
      missionId: missions[1].missionId,
      groupId: group.id,
      permLevel: "editPartial",
    });

    // Mission 2: reachable only through the public baseline.
    await grantMissionPerms(em, {
      missionId: missions[2].missionId,
      userId: publicUser.id,
      permLevel: "viewer",
    });

    const grants = await resolvePermissions(em, user.id);
    expect(grants[missions[0].missionId]).toBe("edit");
    expect(grants[missions[1].missionId]).toBe("editPartial");
    expect(grants[missions[2].missionId]).toBe("viewer");
  });

  it("gives a user with no grants of their own exactly the public missions", async () => {
    const em = globalValues.orm.em.fork();
    const outsider = await upsertAppUser(em, "vitest-outsider");

    // Scoped to this test's missions: the shared database may hold other public grants.
    const grants = await resolvePermissions(em, outsider.id);
    const ownIds = missions.map((m) => m.missionId).filter((id) => id in grants);
    expect(ownIds).toEqual([missions[2].missionId]);
    expect(grants[missions[2].missionId]).toBe("viewer");

    await em.nativeDelete(App_User_db, { id: outsider.id });
  });

  // Every group grant row carries a null user_id by the table's check constraint, so a null userId
  // must not be matched against that column: it would return the union of every group grant in the
  // database. The caller gets the public baseline and nothing else.
  it("gives a null user only the public baseline, never the group grants", async () => {
    const em = globalValues.orm.em.fork();

    const grants = await resolvePermissions(em, null);
    const ownIds = missions.map((m) => m.missionId).filter((id) => id in grants);

    // Mission 1 is reachable only through the group, so its presence would mean over-matching.
    expect(ownIds).toEqual([missions[2].missionId]);
    expect(grants[missions[1].missionId]).toBeUndefined();
    expect(grants[missions[2].missionId]).toBe("viewer");
  });
});

afterAll(async () => {
  const em = globalValues.orm.em.fork();
  for (const mission of missions) {
    await em.nativeDelete(Mission_Permission_db, { missionId: mission.missionId });
    await em.nativeDelete(Doc_Listing_db, { missionId: mission.missionId });
  }
  await em.nativeDelete(App_User_db, { uupic: UUPIC });
  await em.nativeDelete(User_Group_db, { name: GROUP_NAME });

  await globalValues.orm.close();
  globalValues.orm = null;
});
