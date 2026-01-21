import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { App_User_db, Mission_db, Poi_db } from "server/database/models/_allModels";
import AppUserFactory from "../factories/AppUserFactory";
import PoiFactory from "../factories/PoiFactory";
import MissionFactory from "../factories/MissionFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankPoi } from "store/storeUtils/poi";
// suppress socketio calls because they won't work during jest testing
jest.mock("server/express/sockets", () => {
  return {
    __esModule: true,
    ...jest.requireActual("server/express/sockets"),
    emitStoreUpsert: jest.fn(),
    emitStoreDelete: jest.fn(),
  };
});

let testAppUser: App_User_db;
let testMissions: Mission_db[];
let testPois: Poi_db[];

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testMissions = await new MissionFactory(em).create(3);
  testAppUser = await new AppUserFactory(em).createOne({
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
      .send({ username: testAppUser.username, password: "superSecretPassword" });
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

    test("Empty POIs array", async () => {
      const requestBody: POIUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        pois: [],
      };
      const res = await supertest(app)
        .post("/api/v1/poi")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(400);
    });

    test("Create new Poi", async () => {
      const requestBody: POIUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        pois: [{ ...newPoi, missionId: testMissions[0].id, ownerId: testAppUser.id }],
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
      const em = globalValues.orm.em.fork();
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
  const em = globalValues.orm.em.fork();
  for (let i = 0; i < testPois.length; i++) {
    await em.nativeDelete(Poi_db, { uuid: testPois[i].uuid });
  }
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(App_User_db, { id: testAppUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  jest.restoreAllMocks();
});
