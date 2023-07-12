import {
  createMocks,
  createResponse,
  createRequest,
  RequestOptions,
  ResponseOptions,
} from "node-mocks-http";
import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { NextApiRequest, NextApiResponse } from "next";
import login from "pages/api/auth/login";
import { getORM, getEM, closeORM } from "utils/mikro";
import handleUser from "pages/api/users";
import { User as User_db } from "server/database/models/user.model";
import UserFactory from "../factories/UserFactory";
import { TextEncoder, TextDecoder } from "util";
import { IronSessionData } from "iron-session";
import logout from "pages/api/auth/logout";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testUser: User_db;
let testSuperAdmin: User_db;

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testUser = await new UserFactory(em).createOne({
    username: "testRegularUser",
  });
  testSuperAdmin = await new UserFactory(em).createOne({
    username: "testSuperAdmin",
    isSuperAdmin: true,
  });
});

describe("User API Endpoint", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;
  let newUser: Partial<User> = {
    username: "Jest new user",
    password: "password",
  };
  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  test("Returns auth failure", async () => {
    const { req, res } = mockRequestResponse({ method: "GET" });
    await handleUser(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.statusMessage).toEqual("OK");
  });

  test("Returns login session", async () => {
    const loginReqRes = mockRequestResponse({
      method: "POST",
      body: { username: testUser.username, password: "superSecretPassword" },
    });
    await login(loginReqRes.req, loginReqRes.res);
    expect(loginReqRes.res.statusCode).toBe(200); //check response from login
    const response: WrappedResponse<IronSessionData> = loginReqRes.res._getJSONData();
    expect(response.status).toEqual("success");
    loginCookie = loginReqRes.res._getHeaders()["set-cookie"][0];
  });

  describe("Not super admin", () => {
    test("No GET permissions", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { userId: testUser.id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleUser(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("No POST permissions", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        query: { missionId: testUser.id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleUser(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("No DELETE permissions", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { missionId: testUser.id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleUser(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });
  });

  describe("Super admin", () => {
    test("Login as super admin", async () => {
      const logoutReqRes = mockRequestResponse({ method: "GET" });
      await logout(logoutReqRes.req, logoutReqRes.res);

      const loginReqRes = mockRequestResponse({
        method: "POST",
        body: { username: testSuperAdmin.username, password: "superSecretPassword" },
      });
      await login(loginReqRes.req, loginReqRes.res);
      expect(loginReqRes.res.statusCode).toBe(200); //check response from login
      const response: WrappedResponse<IronSessionData> = loginReqRes.res._getJSONData();
      expect(response.status).toEqual("success");
      expect(response.data.user.isSuperAdmin).toBeTruthy();
      loginCookie = loginReqRes.res._getHeaders()["set-cookie"][0];
    });

    describe("GET request", () => {
      test("Returns user", async () => {
        const reqOptions: RequestOptions = {
          method: "GET",
          headers: { cookie: loginCookie },
          query: { userId: testUser.id.toString() },
        };
        const { req, res } = mockRequestResponse(reqOptions);
        await handleUser(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.statusMessage).toEqual("OK");

        const wrappedResponse = res._getJSONData();
        expect(wrappedResponse.status).toBe("success");
        expect(wrappedResponse.data.length).toEqual(1);
      });

      test("No user returned - doesnt exist", async () => {
        const reqOptions: RequestOptions = {
          method: "GET",
          headers: { cookie: loginCookie },
          query: { userId: "99999" },
        };
        const { req, res } = mockRequestResponse(reqOptions);
        await handleUser(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.statusMessage).toEqual("OK");

        const wrappedResponse = res._getJSONData();
        expect(wrappedResponse.status).toBe("success");
        expect(wrappedResponse.data.length).toEqual(0);
      });
    });

    //upsert and delete tests must occur in order.
    describe("POST request", () => {
      test("Create new user", async () => {
        const reqOptions: RequestOptions = {
          method: "POST",
          headers: { cookie: loginCookie },
          body: newUser,
        };
        const { req, res } = mockRequestResponse(reqOptions);
        await handleUser(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.statusMessage).toEqual("OK");

        expect(res._getJSONData().data).not.toBeNull();
        const upsertedUser = res._getJSONData().data;
        expect(upsertedUser.id).not.toBeNull();

        //check if it was added to the db
        const em = getEM();
        const userRef = await em.findOne(User_db, upsertedUser.id);
        expect(userRef).not.toBeNull();
        newUser = { ...upsertedUser };
      });

      test("Update a user", async () => {
        newUser.username = "Jest new user Modified";
        const reqOptions: RequestOptions = {
          method: "POST",
          headers: { cookie: loginCookie },
          body: newUser,
        };
        const { req, res } = mockRequestResponse(reqOptions);
        await handleUser(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.statusMessage).toEqual("OK");

        expect(res._getJSONData().data).not.toBeNull();
        const upsertedUser = res._getJSONData().data;
        expect(upsertedUser).not.toBeNull();
        expect(upsertedUser.username).toEqual("Jest new user Modified");
      });
    });

    describe("DELETE request", () => {
      test("Delete a user", async () => {
        const reqOptions: RequestOptions = {
          method: "DELETE",
          headers: { cookie: loginCookie },
          query: { userId: newUser.id },
        };
        const { req, res } = mockRequestResponse(reqOptions);
        await handleUser(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.statusMessage).toEqual("OK");

        const wrappedResponse = res._getJSONData();
        expect(wrappedResponse.status).toBe("success");
      });
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  await em.nativeDelete(User_db, { id: testUser.id });
  await em.nativeDelete(User_db, { id: testSuperAdmin.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();
});
