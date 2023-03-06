import reducer, { initialState, setLayerControls } from "store/map";
import { setLayers } from "store/mission";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import handleLayer from "pages/api/layer";
import Login from "pages/api/users/login";

import UserFactory from "../factories/UserFactory";
import MissionFactory from "../factories/MissionFactory";
import { Mission as Mission_db } from "server/database/models/mission.model";
import { User as User_db } from "server/database/models/user.model";
import {
  createMocks,
  createRequest,
  createResponse,
  RequestOptions,
  ResponseOptions,
} from "node-mocks-http";
import { NextApiRequest, NextApiResponse } from "next";
import { TextEncoder, TextDecoder } from "util"; //text encoder isn't defined in jest and causes Login call to fail, so import it here
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testMission: Mission_db;
let testAdmin: User_db;

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testAdmin = await new UserFactory(em).createOne();
  testMission = await new MissionFactory(em).createOne();
});

describe("Map and MMGIS Reducer: ", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;

  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  it("should return the initial state on first run", () => {
    // Arrange
    const nextState = initialState;

    // Act
    const result = reducer(undefined, {
      type: undefined,
    });

    // Assert
    expect(result).toEqual(nextState);
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

  it("Set the State when loading Map layer", async () => {
    // Get layers
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: testMission.id.toString() },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleLayer(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    const layers: Layer[] = wrappedResponse.data;

    // Arrange
    const configLayers = setLayers(layers);
    const controls: LayerControls = {};

    // Act
    configLayers.payload.map((configLayer) => {
      controls[configLayer.layerConfig.name] = {
        name: configLayer.layerConfig.name,
        enabled: false,
        type: configLayer.layerConfig.type,
        mapLayerRef: null,
        style: null,
      };
      if (configLayer.layerConfig.sublayers) {
        configLayer.layerConfig.sublayers.map((sublayer) => {
          controls[sublayer.name] = {
            name: sublayer.name,
            enabled: false,
            type: sublayer.type,
            mapLayerRef: null,
            style: null,
          };
        });
      }
    });

    const newControls = {
      payload: controls,
      type: "map/setLayerControls",
    };

    const nextLayerControls = reducer(initialState, setLayerControls(controls));
    expect(setLayerControls(nextLayerControls.layerControls)).toMatchObject(newControls);
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  await em.nativeDelete(Mission_db, { id: testMission.id });
  await em.nativeDelete(User_db, { id: testAdmin.id });
  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();
});
