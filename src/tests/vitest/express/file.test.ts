import supertest from "supertest";
import app from "server/express/restApi";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import AppUserFactory from "../fixtures/entityFactories/AppUserFactory";
import { App_User_db } from "server/database/models/app_user.model";
import * as fileFunctions from "server/file/file";

let testAppUser: App_User_db;
let testAdmin: App_User_db;
const testMissionIds = [1000, 1001, 1002]; // test mission IDs, not real missions

let aegisSessionCookie: string;
let aegisSessionSigCookie: string;

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testAppUser = await new AppUserFactory(em).createOne({
    username: "VitestFileTestNoAdmin",
    isAdmin: false,
    permissionList: [
      {
        missionId: testMissionIds[0],
        permissions: {
          edit: true,
          view: true,
        },
      },
    ],
  });
  testAdmin = await new AppUserFactory(em).createOne({
    username: "VitestFileTestsIsAdmin",
    isAdmin: true,
    permissionList: [
      {
        missionId: testMissionIds[0],
        permissions: {
          edit: true,
          view: true,
        },
      },
      {
        missionId: testMissionIds[1],
        permissions: {
          edit: false,
          view: true,
        },
      },
    ],
  });
});

beforeEach(async () => {
  vi.clearAllMocks(); // clear call count
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Auth failure for file endpoints", () => {
  test("Delete", async () => {
    const res = await supertest(app).delete("/api/v1/file/delete");
    expect(res.statusCode).toBe(401);
  });
  test("List", async () => {
    const res = await supertest(app).get("/api/v1/file/list");
    expect(res.statusCode).toBe(401);
  });
  test("Rename", async () => {
    const res = await supertest(app).get("/api/v1/file/rename");
    expect(res.statusCode).toBe(401);
  });
  test("Upload", async () => {
    const res = await supertest(app).get("/api/v1/file/upload");
    expect(res.statusCode).toBe(401);
  });
});

describe("User with no Admin permissions", () => {
  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testAppUser.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200); //check response from login
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  test("Delete: Failure", async () => {
    const res = await supertest(app)
      .delete("/api/v1/file/delete")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({ missionId: testMissionIds[0] });
    expect(res.statusCode).toBe(401);
  });

  test("List: Failure", async () => {
    const res = await supertest(app)
      .get("/api/v1/file/list")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({ missionId: testMissionIds[0] });
    expect(res.statusCode).toBe(401);
  });

  test("Rename: Failure", async () => {
    const res = await supertest(app)
      .get("/api/v1/file/rename")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({ missionId: testMissionIds[0] });
    expect(res.statusCode).toBe(401);
  });

  test("Upload: Failure", async () => {
    const res = await supertest(app)
      .get("/api/v1/file/upload")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({ missionId: testMissionIds[0] });
    expect(res.statusCode).toBe(401);
  });
});

describe("Admin user with only View permissions", () => {
  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testAdmin.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200); //check response from login
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  // Listing files are allowable with just view permissions

  test("Delete: Failure", async () => {
    const res = await supertest(app)
      .delete("/api/v1/file/delete")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({ missionId: testMissionIds[1] });
    expect(res.statusCode).toBe(401);
  });

  test("Rename: Failure", async () => {
    const res = await supertest(app)
      .get("/api/v1/file/rename")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({ missionId: testMissionIds[1] });
    expect(res.statusCode).toBe(401);
  });

  test("Upload: Failure", async () => {
    const res = await supertest(app)
      .get("/api/v1/file/upload")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({ missionId: testMissionIds[1] });
    expect(res.statusCode).toBe(401);
  });
});

// Just testing the API endpoints, not the file functions themselves
describe("Admin user with Edit permissions", () => {
  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testAdmin.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200); //check response from login
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  test("Delete: Success", async () => {
    const mockDelete = vi.spyOn(fileFunctions, "deleteFile").mockImplementation(async () => {
      return true;
    });

    const res = await supertest(app)
      .delete("/api/v1/file/delete")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
  await em.nativeDelete(App_User_db, { id: testAdmin.id });
  await em.nativeDelete(App_User_db, { id: testAppUser.id });

  // Closing the DB connection allows Vitest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;
  vi.restoreAllMocks();
});
