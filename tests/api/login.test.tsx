import {
  createMocks,
  createResponse,
  createRequest,
  RequestOptions,
  ResponseOptions,
} from "node-mocks-http";
import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { NextApiRequest, NextApiResponse } from "next";
import { getORM, getEM, closeORM } from "utils/mikro";
import isLoggedIn from "pages/api/auth/isLoggedIn";
import logout from "pages/api/auth/logout";
import login from "pages/api/auth/login";
import { User_db } from "server/database/models/_allModels";
import UserFactory from "../factories/UserFactory";
import { TextEncoder, TextDecoder } from "util"; //text encoder isn't defined in jest and causes Login call to fail, so import it here

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testAdmin: User_db;
let testNotAdmin: User_db;

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testAdmin = await new UserFactory(em).createOne({
    username: "testAdminForLogin",
    isAdmin: true,
  });
  testNotAdmin = await new UserFactory(em).createOne({
    username: "testNotAdminForLogin",
    isAdmin: false,
  });
});

describe("Login/Logout API Endpoint", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;

  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  describe("Admin", () => {
    test("Not logged in", async () => {
      const loginReqRes = mockRequestResponse({
        method: "GET",
      });
      await isLoggedIn(loginReqRes.req, loginReqRes.res);
      expect(loginReqRes.res.statusCode).toBe(200);

      const jsonData = await loginReqRes.res._getJSONData();
      expect(jsonData.status).toEqual("failure");
      expect(jsonData.data.user).toBeNull();
    });

    test("Login", async () => {
      const loginReqRes = mockRequestResponse({
        method: "POST",
        body: { username: testAdmin.username, password: "superSecretPassword" },
      });
      await login(loginReqRes.req, loginReqRes.res);
      expect(loginReqRes.res.statusCode).toBe(200); //check response from login
      expect(loginReqRes.req.session.user).not.toBeNull();
      expect(loginReqRes.req.session.user.id).toEqual(testAdmin.id);
      expect(loginReqRes.req.session.user.username).toEqual("testAdminForLogin");
      loginCookie = loginReqRes.res._getHeaders()["set-cookie"][0];

      const jsonData = await loginReqRes.res._getJSONData();
      expect(jsonData.status).toEqual("success");
      expect(jsonData.data.user.username).toEqual("testAdminForLogin");
    });

    test("Is logged in", async () => {
      const loginReqRes = mockRequestResponse({
        method: "GET",
        headers: { cookie: loginCookie },
      });
      await isLoggedIn(loginReqRes.req, loginReqRes.res);
      expect(loginReqRes.res.statusCode).toBe(200);

      const jsonData = await loginReqRes.res._getJSONData();
      expect(jsonData.status).toEqual("success");
      expect(jsonData.data.user.username).toEqual("testAdminForLogin");
    });

    test("Logout", async () => {
      const loginReqRes = mockRequestResponse({
        method: "GET",
      });
      await logout(loginReqRes.req, loginReqRes.res);
      expect(loginReqRes.res.statusCode).toBe(200);
      expect(loginReqRes.req.session).toEqual({});

      const jsonData = await loginReqRes.res._getJSONData();
      expect(jsonData.status).toEqual("success");
      expect(jsonData.data).toEqual(true);
    });
  });

  describe("Not Admin", () => {
    test("Login", async () => {
      const loginReqRes = mockRequestResponse({
        method: "POST",
        body: { username: testNotAdmin.username, password: "superSecretPassword" },
      });
      await login(loginReqRes.req, loginReqRes.res);
      expect(loginReqRes.res.statusCode).toBe(200); //check response from login
      loginCookie = loginReqRes.res._getHeaders()["set-cookie"][0];
      const loginJsonData = await loginReqRes.res._getJSONData();
      expect(loginJsonData.status).toEqual("success");
    });

    test("Logout", async () => {
      const loginReqRes = mockRequestResponse({
        method: "GET",
      });
      await logout(loginReqRes.req, loginReqRes.res);
      expect(loginReqRes.res.statusCode).toBe(200);
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  await em.nativeDelete(User_db, { id: testAdmin.id });
  await em.nativeDelete(User_db, { id: testNotAdmin.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
