import { describe, expect, afterAll, beforeAll, test } from "@jest/globals";
import "@testing-library/jest-dom";
import { NextApiRequest, NextApiResponse } from "next";
import {
  createMocks,
  createResponse,
  createRequest,
  RequestOptions,
  ResponseOptions,
} from "node-mocks-http";
import Login from "pages/api/users/login";

import { getORM, getEM, closeORM } from "utils/mikro";
import UserFactory from "../factories/UserFactory";
import MissionFactory from "../factories/MissionFactory";
import handleLayer from "pages/api/layer";
import LayerFactory from "../factories/LayerFactory";
import { Mission as Mission_db } from "server/database/models/mission.model";
import { User as User_db } from "server/database/models/user.model";
import { Layer as Layer_db } from "server/database/models/layer.model";
import { createNewLayer } from "components/admin/helper";
import fetchMock from "jest-fetch-mock";
import { v4 as uuidv4 } from "uuid";
import { TextEncoder, TextDecoder } from "util"; //text encoder isn't defined in jest and causes Login call to fail, so import it here
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testMission: Mission_db;
let testAdmin: User_db;
let testLayer: Layer_db;

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testAdmin = await new UserFactory(em).createOne();
  testMission = await new MissionFactory(em).createOne();
  testLayer = await new LayerFactory(em)
    .each((layer) => {
      layer.mission = testMission;
    })
    .createOne();

  fetchMock.resetMocks();
});

describe("Layer API Endpoint ", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;
  let newLayer: Layer = createNewLayer();

  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  test("Returns auth failure", async () => {
    const { req, res } = mockRequestResponse({ method: "GET" });
    await handleLayer(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.statusMessage).toEqual("OK");
  });

  test("Returns login session", async () => {
    const loginReqRes = mockRequestResponse({
      method: "POST",
      body: { username: "testAdmin", password: "superSecretPassword" },
    });
    await Login(loginReqRes.req, loginReqRes.res);
    expect(loginReqRes.res.statusCode).toBe(200); //check response from login
    loginCookie = loginReqRes.res._getHeaders()["set-cookie"][0];
  });

  test("Returns empty non-existant layer uuid for mission", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: testMission.id.toString(), uuid: uuidv4() },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleLayer(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const layers: Layer[] = res._getJSONData().data;
    expect(res._getJSONData().status).toBe("success");
    expect(layers.length).toEqual(0);
  });

  test("Returns layers for mission", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: testMission.id.toString() },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleLayer(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const layers: Layer[] = res._getJSONData().data;
    expect(res._getJSONData().status).toBe("success");
    expect(layers.length).toBeGreaterThan(0);
  });

  //upsert and delete tests must occur in order
  test("Create new layer", async () => {
    const reqOptions: RequestOptions = {
      method: "POST",
      headers: { cookie: loginCookie },
      body: { ...newLayer, missionId: testMission.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleLayer(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    expect(res._getJSONData().data).not.toBeNull();
    const upsertedLayer: Layer = res._getJSONData().data;
    expect(upsertedLayer.uuid).not.toBeNull();
    expect(upsertedLayer.createdAt).not.toBeNull();
    expect(upsertedLayer.updatedAt).not.toBeNull();
    newLayer = { ...upsertedLayer };

    //check if it was added to the db
    const em = getEM();
    const layerRef: Layer_db = await em.findOne(Layer_db, upsertedLayer.uuid);
    expect(layerRef).not.toBeNull();
  });

  test("Update a layer", async () => {
    newLayer.layerConfig.name = "LayerConfig Jest Test Modified";
    const reqOptions: RequestOptions = {
      method: "POST",
      headers: { cookie: loginCookie },
      body: newLayer,
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleLayer(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    expect(res._getJSONData().data).not.toBeNull();
    const upsertedLayer: Layer = res._getJSONData().data;
    expect(upsertedLayer).not.toBeNull();
    expect(upsertedLayer.layerConfig.name).toEqual("LayerConfig Jest Test Modified");
  });

  test("Delete a layer", async () => {
    const reqOptions: RequestOptions = {
      method: "DELETE",
      headers: { cookie: loginCookie },
      query: { uuid: `${newLayer.uuid}` },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleLayer(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  await em.nativeDelete(Layer_db, { uuid: testLayer.uuid });
  await em.nativeDelete(Mission_db, { id: testMission.id });
  await em.nativeDelete(User_db, { id: testAdmin.id });
  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();
});
