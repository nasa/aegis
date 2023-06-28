import {
  createMocks,
  createResponse,
  createRequest,
  RequestOptions,
  ResponseOptions,
} from "node-mocks-http";
import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { NextApiRequest, NextApiResponse } from "next";
import Login from "pages/api/users/login";
import { getORM, getEM, closeORM } from "utils/mikro";
import handlePreset from "pages/api/preset";
import { Mission as Mission_db } from "server/database/models/mission.model";
import { Preset as Preset_db } from "server/database/models/preset.model";
import { User as User_db } from "server/database/models/user.model";
import MissionFactory from "../factories/MissionFactory";
import PresetFactory from "../factories/PresetFactory";
import UserFactory from "../factories/UserFactory";
import { v4 as uuidv4 } from "uuid";
import { TextEncoder, TextDecoder } from "util";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testAdmin: User_db;
let testMission: Mission_db;
let testPresets: Preset_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMission = await new MissionFactory(em).createOne();
  testAdmin = await new UserFactory(em).createOne({
    permissionList: [
      {
        missionId: testMission.id,
        permissions: {
          edit: true,
          view: true,
        },
      },
      {
        missionId: 99999,
        permissions: {
          edit: true,
          view: true,
        },
      },
    ],
  });
  testPresets = await new PresetFactory(em)
    .each((preset) => {
      preset.mission = testMission;
      preset.owner = testAdmin;
    })
    .create(2);
});

describe("Preset API Endpoint", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;
  let newPreset: Preset = {
    name: "Preset Jest Test",
    uuid: uuidv4(),
    ownerId: null,
    missionId: null,
    description: null,
    missionPreset: false,
    missionPresetDefault: false,
    mapLayerControls: null,
    layerOrder: null,
    createdAt: null,
    updatedAt: null,
  };

  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  test("Returns auth failure", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: {
        cookie: loginCookie,
      },
      query: { missionId: 1 },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handlePreset(req, res);
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

  test("Returns all mission preset Json", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: testMission.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handlePreset(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toBeGreaterThanOrEqual(1);
  });

  test("Fails to find single preset for mission", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: "99999" },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handlePreset(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toEqual(0);
  });

  //upsert and delete tests must occur in order
  test("Create new preset", async () => {
    const reqOptions: RequestOptions = {
      method: "POST",
      headers: { cookie: loginCookie },
      body: { ...newPreset, missionId: testMission.id, ownerId: testAdmin.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handlePreset(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    expect(res._getJSONData().data).not.toBeNull();
    const upsertedPreset = res._getJSONData().data;
    expect(upsertedPreset.createdAt).not.toBeNull();
    newPreset = { ...upsertedPreset };

    //check if it was added to the db
    const em = getEM();
    const presetRef: Preset_db = await em.findOne(Preset_db, upsertedPreset.uuid);
    expect(presetRef).not.toBeNull();
  });

  test("Update a preset", async () => {
    newPreset.name = "Preset Jest Test Modified";
    const reqOptions: RequestOptions = {
      method: "POST",
      headers: { cookie: loginCookie },
      body: newPreset,
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handlePreset(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    expect(res._getJSONData().data).not.toBeNull();
    const upsertedPreset = res._getJSONData().data;
    expect(upsertedPreset).not.toBeNull();
    expect(upsertedPreset.name).toEqual("Preset Jest Test Modified");
  });

  test("Delete a preset", async () => {
    const reqOptions: RequestOptions = {
      method: "DELETE",
      headers: { cookie: loginCookie },
      query: { uuid: `${newPreset.uuid}`, missionId: testMission.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handlePreset(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (let i = 0; i < testPresets.length; i++) {
    await em.nativeDelete(Preset_db, { uuid: testPresets[i].uuid });
  }
  await em.nativeDelete(Mission_db, { id: testMission.id });
  await em.nativeDelete(User_db, { id: testAdmin.id });
  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();
});
