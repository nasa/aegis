import reducer, { initialState, setMapLayerControls } from "store/map";
import { setLayers } from "store/mission";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import handleLayer from "pages/api/layer";
import Login from "pages/api/users/login";

import UserFactory from "../../factories/UserFactory";
import MissionFactory from "../../factories/MissionFactory";
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
import { TextEncoder, TextDecoder } from "util";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testMission: Mission_db;
let testAdmin: User_db;

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
    ],
  });
});

describe("AEGIS Map Store Tests: ", () => {
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
      body: { user: { username: "testAdmin" }, missionId: testMission.id.toString() },
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
    const controls: MapLayerControls = {};

    // Act
    configLayers.payload.map((configLayer) => {
      controls[configLayer.layerConfig.name] = {
        name: configLayer.layerConfig.name,
        uuid: configLayer.uuid,
        visible: false,
        type: configLayer.layerConfig.type,
        style: null,
      };
      if (configLayer.layerConfig.sublayers) {
        configLayer.layerConfig.sublayers.map((sublayer) => {
          controls[sublayer.name] = {
            name: sublayer.name,
            uuid: sublayer.uuid,
            visible: false,
            type: sublayer.type,
            style: null,
          };
        });
      }
    });

    const newControls = {
      payload: controls,
      type: "map/setMapLayerControls",
    };

    const nextLayerControls = reducer(initialState, setMapLayerControls(controls));
    expect(setMapLayerControls(nextLayerControls.mapLayerControls)).toMatchObject(newControls);
  });

  describe("Map Store: updateMapDirective", () => {
    it("should update the map directive", () => {
      // Arrange
      const nextMapDirective = {
        type: "map/updateMapDirective",
        payload: {
          center: [0, 0],
          zoom: 0,
          bearing: 0,
          pitch: 0,
        },
      };

      // Act
      const result = reducer(initialState, nextMapDirective);

      // Assert
      expect(result.mapDirective).toEqual(nextMapDirective.payload);
    });
    // Should fail to update map Directive
    it("should fail to update the map directive", () => {
      // Arrange
      const nextMapDirective = {
        type: "map/updateMapDirective",
        payload: {
          center: [0, 0],
          zoom: 0,
          bearing: 0,
          pitch: 0,
        },
      };

      // Act
      const result = reducer(initialState, nextMapDirective);

      // Assert
      expect(result.mapDirective).not.toEqual(initialState.mapDirective);
    });
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
