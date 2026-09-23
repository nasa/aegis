import supertest from "supertest";
import app from "server/express/restApi";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import {
  asNobody,
  asSuperUser,
  asUser,
  upsertAppUser,
  upsertMission,
  grantMissionPerms,
} from "../fixtures/access";
import { App_User_db } from "server/database/models/app_user.model";
import * as fileFunctions from "server/file/file";

let testAppUser: App_User_db;
let testSuperUser: App_User_db;
// Each test file owns its own mission id block; grants reference doc_listing_db, so a
// shared range collides when files run in parallel.
const testMissionIds = [1010, 1011, 1012];
const REGULAR_UUPIC = "vitest-file-regular";
const SUPER_UUPIC = "vitest-file-super";

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  for (const missionId of testMissionIds) await upsertMission(em, missionId);

  testAppUser = await upsertAppUser(em, REGULAR_UUPIC);
  await grantMissionPerms(em, {
    missionId: testMissionIds[0],
    userId: testAppUser.id,
    permLevel: "edit",
  });

  // File management is super-user-only, so mission edit alone is not enough.
  testSuperUser = await upsertAppUser(em, SUPER_UUPIC);
});

beforeEach(async () => {
  vi.clearAllMocks(); // clear call count
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Auth failure for file endpoints", () => {
  test("Delete", async () => {
    const res = await supertest(app).delete("/api/v1/file/delete").set(asNobody());
    expect(res.statusCode).toBe(401);
  });
  test("List", async () => {
    const res = await supertest(app).get("/api/v1/file/list").set(asNobody());
    expect(res.statusCode).toBe(401);
  });
  test("Rename", async () => {
    const res = await supertest(app).get("/api/v1/file/rename").set(asNobody());
    expect(res.statusCode).toBe(401);
  });
  test("Upload", async () => {
    const res = await supertest(app).get("/api/v1/file/upload").set(asNobody());
    expect(res.statusCode).toBe(401);
  });
});

describe("User without the super-user role", () => {
  test("Delete: Failure", async () => {
    const res = await supertest(app)
      .delete("/api/v1/file/delete")
      .set(asUser(REGULAR_UUPIC))
      .query({ missionId: testMissionIds[0] });
    expect(res.statusCode).toBe(401);
  });

  test("List: Failure", async () => {
    const res = await supertest(app)
      .get("/api/v1/file/list")
      .set(asUser(REGULAR_UUPIC))
      .query({ missionId: testMissionIds[0] });
    expect(res.statusCode).toBe(401);
  });

  test("Rename: Failure", async () => {
    const res = await supertest(app)
      .get("/api/v1/file/rename")
      .set(asUser(REGULAR_UUPIC))
      .query({ missionId: testMissionIds[0] });
    expect(res.statusCode).toBe(401);
  });

  test("Upload: Failure", async () => {
    const res = await supertest(app)
      .get("/api/v1/file/upload")
      .set(asUser(REGULAR_UUPIC))
      .query({ missionId: testMissionIds[0] });
    expect(res.statusCode).toBe(401);
  });
});

// File management is no longer mission-scoped: it is gated on the super-user role alone, so
// there is no "view-only on this mission" case left to cover.

// Just testing the API endpoints, not the file functions themselves
describe("Super user", () => {
  test("Delete: Success", async () => {
    const mockDelete = vi.spyOn(fileFunctions, "deleteFile").mockImplementation(async () => {
      return true;
    });

    const res = await supertest(app)
      .delete("/api/v1/file/delete")
      .set(asSuperUser(SUPER_UUPIC))
      .query({ missionId: testMissionIds[0], path: "vitestTest/testAPIDelete.txt" });
    expect(res.statusCode).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith("vitestTest/testAPIDelete.txt");
  });

  test("List: Success", async () => {
    const mockList = vi.spyOn(fileFunctions, "listFiles").mockImplementation(async () => {
      return [];
    });

    const res = await supertest(app)
      .get("/api/v1/file/list")
      .set(asSuperUser(SUPER_UUPIC))
      .query({ missionId: testMissionIds[0], path: "vitestTest" });
    expect(res.statusCode).toBe(200);
    expect(mockList).toHaveBeenCalledWith("vitestTest");
  });

  test("Rename: Success", async () => {
    const mockRename = vi.spyOn(fileFunctions, "renameFile").mockImplementation(async () => {
      return true;
    });

    const res = await supertest(app)
      .get("/api/v1/file/rename")
      .set(asSuperUser(SUPER_UUPIC))
      .query({
        missionId: testMissionIds[0],
        path: "vitestTest",
        oldname: "test.txt",
        newname: "testRenamed.txt",
      });
    expect(res.statusCode).toBe(200);
    expect(mockRename).toHaveBeenCalledWith("vitestTest", "test.txt", "testRenamed.txt");
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = globalValues.orm.em.fork();
  await em.nativeDelete(App_User_db, { id: testSuperUser.id });
  await em.nativeDelete(App_User_db, { id: testAppUser.id });

  // Closing the DB connection allows Vitest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;
  vi.restoreAllMocks();
});
