import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { App_User_db, Station_db } from "server/database/models/_allModels";
import AppUserFactory from "../fixtures/entityFactories/AppUserFactory";
import StationFactory from "../fixtures/entityFactories/StationFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankStation } from "store/storeUtils/station";
// suppress socketio calls because they won't work during vitest testing
vi.mock("server/express/sockets", async () => {
  const actual = await vi.importActual("server/express/sockets");
  return {
    ...actual,
    emitStoreUpsert: vi.fn(),
    emitStoreDelete: vi.fn(),
  };
});

let testAppUser: App_User_db;
let testStations: Station_db[];
const testMissionIds = [1000, 1001, 1002]; // test mission IDs, not real missions

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testAppUser = await new AppUserFactory(em).createOne({
    username: "VitestStation",
    permissionList: [
      {
        missionId: testMissionIds[0],
        permissions: {
          edit: true,
          view: true,
        },
      },
      {
        missionId: testMissionIds[1],
        permissions: {
          edit: false,
          view: true,
        },
      },
    ],
  });
  testStations = await new StationFactory(em)
    .each((station) => {
      station.missionId = testMissionIds[0];
    })
    .create(2);
});

describe("Station API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newStation: Station = generateBlankStation({ name: "Vitest Station-1" });

  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testAppUser.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200); //check response from login
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  //upsert and delete tests must occur in order.
  describe("POST request", () => {
    test("No permissions", async () => {
      const requestBody: StationUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[2],
        stations: [{ ...newStation, missionId: testMissionIds[2] }],
      };
      const res = await supertest(app)
        .post("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: StationUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[1],
        stations: [{ ...newStation, missionId: testMissionIds[1] }],
      };
      const res = await supertest(app)
        .post("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Empty stations array", async () => {
      const requestBody: StationUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
        stations: [],
      };
      const res = await supertest(app)
        .post("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(400);
    });

    test("Create new station", async () => {
      const requestBody: StationUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
        stations: [{ ...newStation, missionId: testMissionIds[0], ownerId: testAppUser.id }],
      };
      const res = await supertest(app)
        .post("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0].uuid).not.toBeNull();
      newStation = { ...res.body.data[0] };

      //check if it was added to the db
      const em = globalValues.orm.em.fork();
      const stationReference = await em.findOne(Station_db, res.body.data[0].uuid);
      expect(stationReference).not.toBeNull();
    });

    test("Update a station", async () => {
      newStation.name = "Vitest Test New Station Modified";
      const requestBody: StationUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
        stations: [newStation],
      };
      const res = await supertest(app)
        .post("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0]).not.toBeNull();
      expect(res.body.data[0].name).toEqual("Vitest Test New Station Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: StationDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[2],
        stationUuids: [newStation.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: StationDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[1],
        stationUuids: [newStation.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Delete a station", async () => {
      const requestBody: StationDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
        stationUuids: [newStation.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });
  });
});

describe("Auth with emss-token header", () => {
  const emssToken = process.env.EMSS_TOKEN || "";
  let newStation: Station = generateBlankStation({ name: "Vitest Station-1" });

  test("POST request succeeds with emss-token", async () => {
    const requestBody: StationUpsertRequest = {
      socketId: "someSocketId",
      missionId: testMissionIds[0],
      stations: [{ ...newStation, missionId: testMissionIds[0] }],
    };
    const res = await supertest(app)
      .post("/api/v1/station")
      .set("emss-token", emssToken)
      .send(requestBody);
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].uuid).not.toBeNull();
    newStation = res.body.data[0];
  });

  test("DELETE request succeeds with emss-token", async () => {
    const requestBody: StationDeleteRequest = {
      socketId: "someSocketId",
      missionId: testMissionIds[0],
      stationUuids: [newStation.uuid],
    };
    const res = await supertest(app)
      .delete("/api/v1/station")
      .set("emss-token", emssToken)
      .send(requestBody);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("success");
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = globalValues.orm.em.fork();
  for (let i = 0; i < testStations.length; i++) {
    await em.nativeDelete(Station_db, { uuid: testStations[i].uuid });
  }
  await em.nativeDelete(App_User_db, { id: testAppUser.id });

  // Closing the DB connection allows Vitest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  vi.restoreAllMocks();
});
