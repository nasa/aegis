import supertest from "supertest";
import app from "server/express/restApi";
import { getORM, getEM, closeORM } from "utils/mikro";
import UserFactory from "../factories/UserFactory";
import { App_User_db } from "server/database/models/app_user.model";
import MissionFactory from "tests/jest/factories/MissionFactory";
import { Mission_db } from "server/database/models/_allModels";
import * as fileFunctions from "server/file/file";

let testUser: App_User_db;
let testAdmin: App_User_db;
let testMissions: Mission_db[];

let aegisSessionCookie: string;
let aegisSessionSigCookie: string;

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUser = await new UserFactory(em).createOne({
    username: "JestFileTestNoAdmin",
    isAdmin: false,
    permissionList: [
      {
        missionId: testMissions[0].id,
        permissions: {
          edit: true,
          view: true,
        },
      },
    ],
  });
  testAdmin = await new UserFactory(em).createOne({
    username: "JestFileTestsIsAdmin",
    isAdmin: true,
    permissionList: [
      {
        missionId: testMissions[0].id,
        permissions: {
          edit: true,
          view: true,
        },
      },
      {
        missionId: testMissions[1].id,
        permissions: {
          edit: false,
          view: true,
        },
      },
    ],
  });
});

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

afterAll(() => {
  jest.restoreAllMocks();
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
      .send({ username: testUser.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200); //check response from login
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  test("Delete: Failure", async () => {
    const res = await supertest(app)
      .delete("/api/v1/file/delete")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({ missionId: testMissions[0].id });
    expect(res.statusCode).toBe(401);
  });

  test("List: Failure", async () => {
    const res = await supertest(app)
      .get("/api/v1/file/list")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({ missionId: testMissions[0].id });
    expect(res.statusCode).toBe(401);
  });

  test("Rename: Failure", async () => {
    const res = await supertest(app)
      .get("/api/v1/file/rename")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({ missionId: testMissions[0].id });
    expect(res.statusCode).toBe(401);
  });

  test("Upload: Failure", async () => {
    const res = await supertest(app)
      .get("/api/v1/file/upload")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({ missionId: testMissions[0].id });
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
      .query({ missionId: testMissions[1].id });
    expect(res.statusCode).toBe(401);
  });

  test("Rename: Failure", async () => {
    const res = await supertest(app)
      .get("/api/v1/file/rename")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({ missionId: testMissions[1].id });
    expect(res.statusCode).toBe(401);
  });

  test("Upload: Failure", async () => {
    const res = await supertest(app)
      .get("/api/v1/file/upload")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({ missionId: testMissions[1].id });
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
    const mockDelete = jest.spyOn(fileFunctions, "deleteFile").mockImplementation(async () => {
      return true;
    });

    const res = await supertest(app)
      .delete("/api/v1/file/delete")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({ missionId: testMissions[0].id, path: "jestTest/testAPIDelete.txt" });
    expect(res.statusCode).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith("jestTest/testAPIDelete.txt");
  });

  test("List: Success", async () => {
    const mockList = jest.spyOn(fileFunctions, "listFiles").mockImplementation(async () => {
      return [];
    });

    const res = await supertest(app)
      .get("/api/v1/file/list")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({ missionId: testMissions[0].id, path: "jestTest" });
    expect(res.statusCode).toBe(200);
    expect(mockList).toHaveBeenCalledWith("jestTest");
  });

  test("Rename: Success", async () => {
    const mockRename = jest.spyOn(fileFunctions, "renameFile").mockImplementation(async () => {
      return true;
    });

    const res = await supertest(app)
      .get("/api/v1/file/rename")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
      .query({
        missionId: testMissions[0].id,
        path: "jestTest",
        oldname: "test.txt",
        newname: "testRenamed.txt",
      });
    expect(res.statusCode).toBe(200);
    expect(mockRename).toHaveBeenCalledWith("jestTest", "test.txt", "testRenamed.txt");
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  await em.nativeDelete(App_User_db, { id: testAdmin.id });
  await em.nativeDelete(App_User_db, { id: testUser.id });
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
