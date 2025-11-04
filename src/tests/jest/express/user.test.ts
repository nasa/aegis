import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { App_User_db } from "server/database/models/_allModels";
import UserFactory from "../factories/UserFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankUser } from "store/storeUtils/user";

let testUser: App_User_db;
let testSuperAdmin: App_User_db;

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testUser = await new UserFactory(em).createOne({
    username: "Jest regular user",
  });
  testSuperAdmin = await new UserFactory(em).createOne({
    username: "Jest super admin",
    isSuperAdmin: true,
  });
});

describe("User API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newUser: AppUser = generateBlankUser({
    username: "JestUserForUserTest",
    password: "password",
  });

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/users");
    expect(res.statusCode).toBe(401);
  });

  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testUser.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200); //check response from login
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  describe("Not super admin", () => {
    test("No GET permissions", async () => {
      const res = await supertest(app)
        .get("/api/v1/users")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ userId: testUser.id });

      expect(res.statusCode).toBe(401);
    });

    test("No POST permissions", async () => {
      const res = await supertest(app)
        .post("/api/v1/users")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send({ users: [] });

      expect(res.statusCode).toBe(401);
    });

    test("No DELETE permissions", async () => {
      const res = await supertest(app)
        .delete("/api/v1/users")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send({ userIds: [] });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("Super admin", () => {
    test("Login as super admin", async () => {
      await supertest(app).get("/api/v1/auth/logout");

      const res = await supertest(app)
        .post("/api/v1/auth/login")
        .send({ username: testSuperAdmin.username, password: "superSecretPassword" });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toEqual("success");
      expect(res.body.data.isSuperAdmin).toBeTruthy();
      aegisSessionCookie = res.header["set-cookie"][0];
      aegisSessionSigCookie = res.header["set-cookie"][1];
    });

    describe("GET request", () => {
      test("Returns user", async () => {
        const res = await supertest(app)
          .get("/api/v1/users")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ userId: testUser.id });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(1);
      });

      test("No user returned - doesnt exist", async () => {
        const res = await supertest(app)
          .get("/api/v1/users")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ userId: "99999" });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(0);
      });
    });

    describe("POST request", () => {
      test("Create new user", async () => {
        const requestBody: UserUpsertRequest = {
          users: [newUser],
        };
        const res = await supertest(app)
          .post("/api/v1/users")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .send(requestBody);

        expect(res.statusCode).toBe(200);
        expect(res.body.data[0].id).not.toBeNull();

        //check if it was added to the db
        const em = globalValues.orm.em.fork();
        const userRef = await em.findOne(App_User_db, res.body.data[0].id);
        expect(userRef).not.toBeNull();
        newUser = { ...res.body.data[0] };
      });

      test("Update a user", async () => {
        newUser.username = "Jest new user Modified";
        const requestBody: UserUpsertRequest = {
          users: [newUser],
        };
        const res = await supertest(app)
          .post("/api/v1/users")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .send(requestBody);

        expect(res.statusCode).toBe(200);
        expect(res.body.data[0]).not.toBeNull();
        expect(res.body.data[0].username).toEqual("Jest new user Modified");
      });
    });

    describe("DELETE request", () => {
      test("Delete a user", async () => {
        const requestBody: UserDeleteRequest = {
          userIds: [newUser.id],
        };
        const res = await supertest(app)
          .delete("/api/v1/users")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .send(requestBody);

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
      });
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = globalValues.orm.em.fork();
  await em.nativeDelete(App_User_db, { id: testUser.id });
  await em.nativeDelete(App_User_db, { id: testSuperAdmin.id });

  // Closing the DB connection allows Jest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  jest.restoreAllMocks();
});
