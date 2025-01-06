import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import { User_db, Mission_db, Poi_db } from "server/database/models/_allModels";
import UserFactory from "../factories/UserFactory";
import PoiFactory from "../factories/PoiFactory";
import MissionFactory from "../factories/MissionFactory";
import { TextEncoder, TextDecoder } from "util";
import * as SocketIo from "server/express/sockets";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankPoi } from "store/storeUtils/poi";
jest.mock("server/express/sockets", () => {
  return {
    __esModule: true,
    ...jest.requireActual("server/express/sockets"),
  };
});

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testUser: User_db;
let testMissions: Mission_db[];
let testPois: Poi_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUser = await new UserFactory(em).createOne({
    username: "JestPoi",
    permissionList: [
      {
        missionId: testMissions[0].id,
        permissions: {
          edit: true,
          view: true,
        },
      },
      {
        missionId: testMissions[1].id,
        permissions: {
          edit: false,
          view: true,
        },
      },
    ],
  });
  testPois = await new PoiFactory(em)
    .each((poi) => {
      poi.mission = testMissions[0];
    })
    .create(2);

  // suppress socketio calls because they won't work during jest testing
  jest.spyOn(SocketIo, "emitStoreUpsert").mockImplementation(() => {});
  jest.spyOn(SocketIo, "emitStoreDelete").mockImplementation(() => {});
});

describe("Poi API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newPoi: POI = generateBlankPoi({ name: "Jest Test New Poi" });

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/poi").query({ missionId: testMissions[0].id });
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

  describe("GET request", () => {
    test("No permissions", async () => {
      const res = await supertest(app)
        .get("/api/v1/poi")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[2].id });

      expect(res.statusCode).toBe(401);
    });

    test("Returns all Pois for mission", async () => {
      const res = await supertest(app)
        .get("/api/v1/poi")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toBeGreaterThan(1);
    });

    test("No Pois returned", async () => {
      const res = await supertest(app)
        .get("/api/v1/poi")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[1].id });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(0);
    });
  });

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions", async () => {
      const requestBody: POIUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[2].id,
        pois: [newPoi],
      };
      const res = await supertest(app)
        .post("/api/v1/poi")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: POIUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[1].id,
        pois: [newPoi],
      };
      const res = await supertest(app)
        .post("/api/v1/poi")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Create new Poi", async () => {
      const requestBody: POIUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        pois: [{ ...newPoi, missionId: testMissions[0].id, ownerId: testUser.id }],
      };
      const res = await supertest(app)
        .post("/api/v1/poi")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      const upsertedPoi = res.body.data[0];
      expect(upsertedPoi.uuid).not.toBeNull();
      newPoi = { ...upsertedPoi };

      //check if it was added to the db
      const em = getEM();
      const poiReference = await em.findOne(Poi_db, upsertedPoi.uuid);
      expect(poiReference).not.toBeNull();
    });

    test("Update a Poi", async () => {
      newPoi.name = "Jest New Poi Modified";
      const requestBody: POIUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        pois: [{ ...newPoi }],
      };
      const res = await supertest(app)
        .post("/api/v1/poi")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0]).not.toBeNull();
      expect(res.body.data[0].name).toEqual("Jest New Poi Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: POIDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissions[2].id,
        poiUuids: [newPoi.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/poi")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: POIDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissions[1].id,
        poiUuids: [newPoi.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/poi")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Delete a Poi", async () => {
      const requestBody: POIDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        poiUuids: [newPoi.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/poi")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });
  });
});

describe("Auth with emss-token header", () => {
  const emssToken = process.env.EMSS_TOKEN || "";
  const newPoi = generateBlankPoi({ name: "Jest Test New Poi" });

  test("GET request succeeds with emss-token", async () => {
    const res = await supertest(app)
      .get("/api/v1/poi")
      .set("emss-token", emssToken)
      .query({ missionId: testMissions[0].id });
    expect(res.statusCode).toBe(200);
    // ...additional assertions...
  });

  test("POST request succeeds with emss-token", async () => {
    const requestBody: POIUpsertRequest = {
      socketId: "someSocketId",
      missionId: testMissions[0].id,
      pois: [{ ...newPoi, missionId: testMissions[0].id }],
    };
    const res = await supertest(app)
      .post("/api/v1/poi")
      .set("emss-token", emssToken)
      .send(requestBody);
    expect(res.statusCode).toBe(200);
    // ...additional assertions...
  });

  test("DELETE request succeeds with emss-token", async () => {
    const requestBody: POIDeleteRequest = {
      socketId: "someSocketId",
      missionId: testMissions[0].id,
      poiUuids: [newPoi.uuid],
    };
    const res = await supertest(app)
      .delete("/api/v1/poi")
      .set("emss-token", emssToken)
      .send(requestBody);
    expect(res.statusCode).toBe(200);
    // ...additional assertions...
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (let i = 0; i < testPois.length; i++) {
    await em.nativeDelete(Poi_db, { uuid: testPois[i].uuid });
  }
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
