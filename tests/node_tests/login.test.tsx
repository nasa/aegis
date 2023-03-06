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
import isLoggedIn from "pages/api/users/isLoggedIn";
import logout from "pages/api/users/logout";
import login from "pages/api/users/login";
import { User as User_db } from "server/database/models/user.model";
import UserFactory from "../factories/UserFactory";
import { TextEncoder, TextDecoder } from "util"; //text encoder isn't defined in jest and causes Login call to fail, so import it here
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testAdmin: User_db;

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testAdmin = await new UserFactory(em).createOne({
    username: "testAdminForLogin",
  });
});

describe("Action API Endpoint", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;

  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

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
      body: { username: "testAdminForLogin", password: "superSecretPassword" },
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

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  await em.nativeDelete(User_db, { id: testAdmin.id });

  // Closing the DB connection allows Jest to exit successfully.
  closeORM();
});
