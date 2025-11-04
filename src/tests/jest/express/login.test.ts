import supertest from "supertest";
import app from "server/express/restApi";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import UserFactory from "../factories/UserFactory";
import { App_User_db } from "server/database/models/app_user.model";

let testAdmin: App_User_db;

let aegisSessionCookie: string = "";
let aegisSessionSigCookie: string = "";

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testAdmin = await new UserFactory(em).createOne({
    username: "JesttestAdminForLogin",
    isAdmin: true,
  });
});

describe("Login functions", () => {
  it("isLoggedIn responds with failure when not logged in", async () => {
    const response = await supertest(app)
      .get("/api/v1/auth/isLoggedIn")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie]);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "failure",
      message: "Not Logged in",
      data: { user: null },
    });
  });
  it("Login possible using mock user", async () => {
    const response = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testAdmin.username, password: "superSecretPassword" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "success",
      message: "login successful",
      data: {
        id: testAdmin.id,
        username: testAdmin.username,
        isAdmin: true,
        isSuperAdmin: false,
        permissionList: null,
      },
    });
    aegisSessionCookie = response.header["set-cookie"][0];
    aegisSessionSigCookie = response.header["set-cookie"][1];
  });
  it("isLoggedIn responds with success when logged in", async () => {
    const response = await supertest(app)
      .get("/api/v1/auth/isLoggedIn")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie]);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "success",
      message: "Login checked",
      data: {
        id: testAdmin.id,
        username: testAdmin.username,
        isAdmin: true,
        isSuperAdmin: false,
        permissionList: null,
      },
    });
  });
  it("Logout responds with success", async () => {
    const response = await supertest(app)
      .get("/api/v1/auth/logout")
      .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie]);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "success",
      message: "Logged out",
      data: true,
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = globalValues.orm.em.fork();
  await em.nativeDelete(App_User_db, { id: testAdmin.id });

  // Closing the DB connection allows Jest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  jest.restoreAllMocks();
});
