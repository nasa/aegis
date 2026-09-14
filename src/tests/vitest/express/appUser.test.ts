import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { App_User_db } from "server/database/models/_allModels";
import AppUserFactory from "../fixtures/entityFactories/AppUserFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankAppUser } from "store/storeUtils/appUser";
import type { Mock } from "vitest";
import { resetToastSpies, setupToastSpies, type ToastSpies } from "../helpers/mockToasts";
import { deleteAppUsers, upsertAppUsers } from "http-client/appUser";

global.fetch = vi.fn();

let toastSpies: ToastSpies;

let testAppUser: App_User_db;
let testSuperAdmin: App_User_db;

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testAppUser = await new AppUserFactory(em).createOne({
    username: "Vitest regular appUser",
  });
  testSuperAdmin = await new AppUserFactory(em).createOne({
    username: "Vitest super admin",
    isSuperAdmin: true,
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  toastSpies = setupToastSpies();
});

afterAll(() => {
  resetToastSpies(toastSpies);
});

describe("AppUser API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newUser: AppUser = generateBlankAppUser({
    username: "VitestUserForUserTest",
    password: "password",
  });

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/appUsers");
    expect(res.statusCode).toBe(401);
  });

  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testAppUser.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200); //check response from login
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  describe("Not super admin", () => {
    test("No GET permissions", async () => {
      const res = await supertest(app)
        .get("/api/v1/appUsers")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ userId: testAppUser.id });

      expect(res.statusCode).toBe(401);
    });

    test("No POST permissions", async () => {
      const res = await supertest(app)
        .post("/api/v1/appUsers")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send({ users: [] });

      expect(res.statusCode).toBe(401);
    });

    test("No DELETE permissions", async () => {
      const res = await supertest(app)
        .delete("/api/v1/appUsers")
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
          .get("/api/v1/appUsers")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ userId: testAppUser.id });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(1);
      });

      test("No user returned - doesnt exist", async () => {
        const res = await supertest(app)
          .get("/api/v1/appUsers")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ userId: "99999" });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(0);
      });
    });

    describe("POST request", () => {
      test("Empty users array", async () => {
        const requestBody: UserUpsertRequest = {
          users: [],
        };
        const res = await supertest(app)
          .post("/api/v1/appUsers")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .send(requestBody);

        expect(res.statusCode).toBe(400);
      });

      test("Create new user", async () => {
        const requestBody: UserUpsertRequest = {
          users: [newUser],
        };
        const res = await supertest(app)
          .post("/api/v1/appUsers")
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
        newUser.username = "Vitest new user Modified";
        const requestBody: UserUpsertRequest = {
          users: [newUser],
        };
        const res = await supertest(app)
          .post("/api/v1/appUsers")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .send(requestBody);

        expect(res.statusCode).toBe(200);
        expect(res.body.data[0]).not.toBeNull();
        expect(res.body.data[0].username).toEqual("Vitest new user Modified");
      });

      test("Displays toast error if res status not 200", async () => {
        (global.fetch as Mock).mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

        newUser.username = "Vitest new user Modified";
        const users = [newUser];
        const result = await upsertAppUsers(users);

        expect(result.status).toBe("error");
        expect(toastSpies.error).toHaveBeenCalledTimes(1);
        expect(toastSpies.error.mock.calls[0][0]).toContain("Error saving users to database.");
      });
    });

    describe("DELETE request", () => {
      test("Delete a user", async () => {
        const requestBody: UserDeleteRequest = {
          userIds: [newUser.id],
        };
        const res = await supertest(app)
          .delete("/api/v1/appUsers")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .send(requestBody);

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
      });

      test("Displays toast error if res status not 200", async () => {
        (global.fetch as Mock).mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

        const userIds = [1, 2, 3];
        const result = await deleteAppUsers(userIds);

        expect(result.status).toBe("error");
        expect(toastSpies.error).toHaveBeenCalledTimes(1);
        expect(toastSpies.error.mock.calls[0][0]).toContain("Error deleting users from database.");
      });
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = globalValues.orm.em.fork();
  await em.nativeDelete(App_User_db, { id: testAppUser.id });
  await em.nativeDelete(App_User_db, { id: testSuperAdmin.id });

  // Closing the DB connection allows Vitest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  vi.restoreAllMocks();
});
