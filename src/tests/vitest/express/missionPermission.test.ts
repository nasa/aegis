import { MikroORM } from "@mikro-orm/postgresql";
import supertest from "supertest";

import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import app from "server/express/restApi";
import {
  App_User_db,
  Doc_Listing_db,
  Mission_Permission_db,
  User_Group_db,
} from "server/database/models/_allModels";
import DocListingFactory from "../fixtures/entityFactories/DocListingFactory";
import {
  asSuperUser,
  asUser,
  grantMissionPerms,
  upsertAppUser,
  upsertGroup,
  upsertPublicUser,
  upsertUserToGroup,
} from "../fixtures/access";

const SUPER_UUPIC = "vitest-missionperm-super";
const MEMBER_UUPIC = "vitest-missionperm-member";
const GROUP_NAME = "vitest-missionperm-group";

let member: App_User_db;
let publicUser: App_User_db;
let group: User_Group_db;
let missions: Doc_Listing_db[];

beforeAll(async () => {
  globalValues.orm = await MikroORM.init(config);
  const em = globalValues.orm.em.fork();

  missions = await new DocListingFactory(em).create(2);
  await upsertAppUser(em, SUPER_UUPIC);
  member = await upsertAppUser(em, MEMBER_UUPIC);
  publicUser = await upsertPublicUser(em);
  group = await upsertGroup(em, GROUP_NAME);
  await upsertUserToGroup(em, group.id, member.id);

  for (const mission of missions) {
    await em.nativeDelete(Mission_Permission_db, { missionId: mission.missionId });
  }

  // Mission 0 is reachable three ways at once, which is what the contribution list has to show.
  await grantMissionPerms(em, {
    missionId: missions[0].missionId,
    userId: member.id,
    permLevel: "viewer",
    notes: "vitest direct note",
  });
  await grantMissionPerms(em, {
    missionId: missions[0].missionId,
    groupId: group.id,
    permLevel: "edit",
  });
  await grantMissionPerms(em, {
    missionId: missions[0].missionId,
    userId: publicUser.id,
    permLevel: "viewer",
    notes: "vitest public note",
  });
});

describe("GET /api/v1/missionPermission", () => {
  test("Rejects a caller without the super-user role", async () => {
    const res = await supertest(app)
      .get("/api/v1/missionPermission")
      .set(asUser(MEMBER_UUPIC))
      .query({ userId: member.id });
    expect(res.statusCode).toBe(401);
  });

  test("Rejects a request with no selector", async () => {
    const res = await supertest(app).get("/api/v1/missionPermission").set(asSuperUser(SUPER_UUPIC));
    expect(res.statusCode).toBe(400);
  });

  test("?userId= returns every contribution, flagging only the highest as effective", async () => {
    const res = await supertest(app)
      .get("/api/v1/missionPermission")
      .set(asSuperUser(SUPER_UUPIC))
      .query({ userId: member.id });

    expect(res.statusCode).toBe(200);
    const entry = (res.body.data as ResolvedMissionAccess[]).find(
      (a) => a.missionId === missions[0].missionId
    );

    expect(entry.effectivePermLevel).toBe("edit");
    expect(entry.contributions).toHaveLength(3);

    const direct = entry.contributions.find((c) => c.source === "direct");
    const viaGroup = entry.contributions.find((c) => c.source === "group");
    const viaPublic = entry.contributions.find((c) => c.source === "public");

    // The direct grant is out-ranked but must still be visible, which is the whole point of
    // returning contributions rather than only the winner.
    expect(direct.permLevel).toBe("viewer");
    expect(direct.isEffective).toBe(false);
    expect(direct.notes).toBe("vitest direct note");

    expect(viaGroup.permLevel).toBe("edit");
    expect(viaGroup.isEffective).toBe(true);
    expect(viaGroup.groupName).toBe(GROUP_NAME);

    expect(viaPublic.permLevel).toBe("viewer");
    expect(viaPublic.isEffective).toBe(false);
  });

  test("?missionId= expands each group's members and reports public status", async () => {
    const res = await supertest(app)
      .get("/api/v1/missionPermission")
      .set(asSuperUser(SUPER_UUPIC))
      .query({ missionId: missions[0].missionId });

    expect(res.statusCode).toBe(200);
    const summary = res.body.data as MissionAccessSummary;

    expect(summary.isPublic).toBe(true);
    expect(summary.publicUserId).toBe(publicUser.id);

    const groupSubject = summary.subjects.find(
      (s) => s.subjectType === "group" && s.subjectId === group.id
    );
    expect(groupSubject.members.map((m) => m.id)).toEqual([member.id]);

    const userSubject = summary.subjects.find(
      (s) => s.subjectType === "user" && s.subjectId === member.id
    );
    expect(userSubject.subjectAuid).toBe(MEMBER_UUPIC);
  });

  test("?groupId= returns the group's grants in one request", async () => {
    const res = await supertest(app)
      .get("/api/v1/missionPermission")
      .set(asSuperUser(SUPER_UUPIC))
      .query({ groupId: group.id });

    expect(res.statusCode).toBe(200);
    const grants = res.body.data as MissionPermission[];
    expect(grants.map((g) => g.missionId)).toEqual([missions[0].missionId]);
    expect(grants[0].permLevel).toBe("edit");
  });
});

describe("POST /api/v1/missionPermission", () => {
  test("Rejects a caller without the super-user role", async () => {
    const res = await supertest(app)
      .post("/api/v1/missionPermission")
      .set(asUser(MEMBER_UUPIC))
      .send({ missionId: missions[1].missionId, userId: member.id, permLevel: "edit" });

    expect(res.statusCode).toBe(401);
  });

  // A missing or garbage missionId used to reach the driver and come back as a 500 carrying raw
  // ORM text, which reads to the caller as an AEGIS fault rather than a bad request.
  test.each([
    ["missing", undefined],
    ["non-numeric", "abc"],
    ["zero", 0],
  ])("Rejects a %s missionId", async (_label, missionId) => {
    const res = await supertest(app)
      .post("/api/v1/missionPermission")
      .set(asSuperUser(SUPER_UUPIC))
      .send({ missionId, userId: member.id, permLevel: "viewer" });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("A numeric missionId is required");
  });

  test("Rejects a grant naming neither a user nor a group", async () => {
    const res = await supertest(app)
      .post("/api/v1/missionPermission")
      .set(asSuperUser(SUPER_UUPIC))
      .send({ missionId: missions[1].missionId, permLevel: "viewer" });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Exactly one of userId or groupId is required");
  });

  test("Returns 404 for a mission that does not exist", async () => {
    const res = await supertest(app)
      .post("/api/v1/missionPermission")
      .set(asSuperUser(SUPER_UUPIC))
      .send({ missionId: 2147483600, userId: member.id, permLevel: "viewer" });

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Mission not found");
  });

  test("Returns 404 for a group that does not exist", async () => {
    const res = await supertest(app)
      .post("/api/v1/missionPermission")
      .set(asSuperUser(SUPER_UUPIC))
      .send({ missionId: missions[1].missionId, groupId: 2147483600, permLevel: "viewer" });

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Group not found");
  });

  test("Rejects any level above viewer for the Public user", async () => {
    for (const permLevel of ["edit", "editPartial"]) {
      const res = await supertest(app)
        .post("/api/v1/missionPermission")
        .set(asSuperUser(SUPER_UUPIC))
        .send({ missionId: missions[1].missionId, userId: publicUser.id, permLevel });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Public grants are limited to viewer");
    }
  });

  test("Rejects raising an existing Public grant to edit", async () => {
    const res = await supertest(app)
      .post("/api/v1/missionPermission")
      .set(asSuperUser(SUPER_UUPIC))
      .send({ missionId: missions[0].missionId, userId: publicUser.id, permLevel: "edit" });

    expect(res.statusCode).toBe(400);

    const em = globalValues.orm.em.fork();
    const grant = await em.findOne(Mission_Permission_db, {
      missionId: missions[0].missionId,
      userId: publicUser.id,
    });
    expect(grant.permLevel).toBe("viewer");
  });

  test("Rejects a grant naming both a user and a group", async () => {
    const res = await supertest(app)
      .post("/api/v1/missionPermission")
      .set(asSuperUser(SUPER_UUPIC))
      .send({
        missionId: missions[1].missionId,
        userId: member.id,
        groupId: group.id,
        permLevel: "viewer",
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Exactly one of userId or groupId is required");
  });

  test("Updating notes leaves the level and grantedBy untouched", async () => {
    const em = globalValues.orm.em.fork();
    const before = await em.findOne(Mission_Permission_db, {
      missionId: missions[0].missionId,
      userId: member.id,
    });

    const res = await supertest(app)
      .post("/api/v1/missionPermission")
      .set(asSuperUser(SUPER_UUPIC))
      .send({
        missionId: missions[0].missionId,
        userId: member.id,
        permLevel: before.permLevel,
        notes: "vitest updated note",
      });
    expect(res.statusCode).toBe(200);

    const after = await globalValues.orm.em
      .fork()
      .findOne(Mission_Permission_db, { id: before.id }, { refresh: true });
    expect(after.notes).toBe("vitest updated note");
    expect(after.permLevel).toBe(before.permLevel);
    expect(after.grantedBy).toBe(before.grantedBy);
  });

  test("Rejects notes longer than the cap", async () => {
    const res = await supertest(app)
      .post("/api/v1/missionPermission")
      .set(asSuperUser(SUPER_UUPIC))
      .send({
        missionId: missions[1].missionId,
        userId: member.id,
        permLevel: "viewer",
        notes: "x".repeat(2001),
      });

    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /api/v1/missionPermission", () => {
  test("Rejects a caller without the super-user role", async () => {
    const res = await supertest(app)
      .delete("/api/v1/missionPermission")
      .set(asUser(MEMBER_UUPIC))
      .send({ missionId: missions[0].missionId, userId: member.id });

    expect(res.statusCode).toBe(401);
  });

  test("Rejects a missing missionId", async () => {
    const res = await supertest(app)
      .delete("/api/v1/missionPermission")
      .set(asSuperUser(SUPER_UUPIC))
      .send({ userId: member.id });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("A numeric missionId is required");
  });

  test("Rejects a revoke naming neither a user nor a group", async () => {
    const res = await supertest(app)
      .delete("/api/v1/missionPermission")
      .set(asSuperUser(SUPER_UUPIC))
      .send({ missionId: missions[0].missionId });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Exactly one of userId or groupId is required");
  });

  // Revoking is security-critical, so a request that removed nothing must not read as a success.
  test("Reports a revoke that matched no grant rather than claiming success", async () => {
    const res = await supertest(app)
      .delete("/api/v1/missionPermission")
      .set(asSuperUser(SUPER_UUPIC))
      .send({ missionId: missions[1].missionId, userId: member.id });

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("No matching grant to revoke");
  });

  test("Revokes only the named grant, leaving the other subjects on that mission alone", async () => {
    const em = globalValues.orm.em.fork();
    const target = await grantMissionPerms(em, {
      missionId: missions[1].missionId,
      userId: member.id,
      permLevel: "viewer",
      notes: "vitest revoke target",
    });

    const res = await supertest(app)
      .delete("/api/v1/missionPermission")
      .set(asSuperUser(SUPER_UUPIC))
      .send({ missionId: missions[1].missionId, userId: member.id });

    expect(res.statusCode).toBe(200);
    expect(await em.count(Mission_Permission_db, { id: target.id })).toBe(0);
    // The member's grant on mission 0 is a different row and must survive.
    expect(
      await em.count(Mission_Permission_db, {
        missionId: missions[0].missionId,
        userId: member.id,
      })
    ).toBe(1);
  });
});

describe("POST /api/v1/userGroup/member", () => {
  test("Rejects adding the Public user to a group", async () => {
    const res = await supertest(app)
      .post("/api/v1/userGroup/member")
      .set(asSuperUser(SUPER_UUPIC))
      .send({ groupId: group.id, userId: publicUser.id, action: "add" });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("The Public user cannot join a group");
  });
});

describe("GET /api/v1/appUsers", () => {
  test("Search matches on auid and withPermissionsOnly filters out grantless users", async () => {
    const em = globalValues.orm.em.fork();
    const grantless = await upsertAppUser(em, "vitest-missionperm-grantless");

    const all = await supertest(app)
      .get("/api/v1/appUsers")
      .set(asSuperUser(SUPER_UUPIC))
      .query({ search: "vitest-missionperm" });
    expect(all.statusCode).toBe(200);
    expect((all.body.data as AppUserSummary[]).map((u) => u.id)).toContain(grantless.id);

    const withPermissions = await supertest(app)
      .get("/api/v1/appUsers")
      .set(asSuperUser(SUPER_UUPIC))
      .query({ search: "vitest-missionperm", withPermissionsOnly: "true" });
    const ids = (withPermissions.body.data as AppUserSummary[]).map((u) => u.id);
    expect(ids).not.toContain(grantless.id);
    expect(ids).toContain(member.id);

    await em.nativeDelete(App_User_db, { id: grantless.id });
  });
});

afterAll(async () => {
  const em = globalValues.orm.em.fork();
  for (const mission of missions) {
    await em.nativeDelete(Mission_Permission_db, { missionId: mission.missionId });
    await em.nativeDelete(Doc_Listing_db, { missionId: mission.missionId });
  }
  await em.nativeDelete(User_Group_db, { name: GROUP_NAME });
  await em.nativeDelete(App_User_db, { uupic: { $in: [SUPER_UUPIC, MEMBER_UUPIC] } });

  await globalValues.orm.close();
  globalValues.orm = null;
});
