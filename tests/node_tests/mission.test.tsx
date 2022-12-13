import { createMocks, createResponse, createRequest, RequestMethod } from "node-mocks-http";
import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { NextApiRequest, NextApiResponse } from "next";
import Login from "../../pages/api/users/login";
import Mikro from "utils/mikro";
import { handleMission, getMissions, upsertMission, deleteMission } from "../../pages/api/mission";
import { Mission as Mission_db } from "server/database/models/mission.model";
import { User as User_db } from "server/database/models/user.model";
import MissionFactory from "../helpers/MissionFactory";
import UserFactory from "../helpers/UserFactory";

let testMission: Mission_db;
let testAdmin: User_db;
let multipleMissions: Mission_db[];

beforeAll(async () => {
  await Mikro.getORM();
  const em = Mikro.getEM();
  testAdmin = await new UserFactory(em).createOne();
  testMission = await new MissionFactory(em).createOne();
  multipleMissions = await new MissionFactory(em).create(5);
  await Mikro.closeORM();
});

describe("Mission API Endpoint Handler", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  function mockRequestResponse(method: RequestMethod = "POST") {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks({ method });
    return { req, res };
  }

  test("Mission: Returns auth failure single mission", async () => {
    const { req, res } = mockRequestResponse("GET");
    req.query = { missionId: testMission.id.toString() };
    await handleMission(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.statusMessage).toEqual("OK");
  });

  test("Missions: Returns auth failure all mission", async () => {
    const { req, res } = mockRequestResponse("GET");
    await handleMission(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.statusMessage).toEqual("OK");
  });

  test("Mission: Returns single mission Json", async () => {
    const { req, res } = mockRequestResponse();
    req.body = { username: "testAdmin", password: "superSecretPassword" };
    await Login(req, res);
    req.query = { missionId: testMission.id.toString() };
    req.method = "GET";
    await handleMission(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");
  });

  test("Mission: Returns all missions Json", async () => {
    const { req, res } = mockRequestResponse();
    req.body = { username: "testAdmin", password: "superSecretPassword" };
    await Login(req, res);
    req.method = "GET";
    await handleMission(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");
  });

  test("Mission: Fails to find single mission", async () => {
    const { req, res } = mockRequestResponse();
    req.body = { username: "testAdmin", password: "superSecretPassword" };
    await Login(req, res);
    req.query = { missionId: "99999" };
    req.method = "GET";
    await handleMission(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.statusMessage).toEqual("OK");
  });
});

describe("Mission API Mikro Functions", () => {
  const newMission: Mission = {
    name: "Mission Jest Test",
    config: null,
  };

  test("Mission getMissions(): Returns single mission data", async () => {
    const mission = await getMissions(testMission.id);
    expect(mission).not.toBeNull();
    expect(mission.length).toEqual(1);
  });

  test("Missions getMissions(): Returns all mission data", async () => {
    const mission = await getMissions();
    expect(mission).not.toBeNull();
    expect(mission.length).toBeGreaterThan(1);
  });

  //upsert and delete tests must occur in order
  test("Missions upsertMission(): Create new mission", async () => {
    const upsertedMission = await upsertMission(newMission);
    expect(upsertedMission).not.toBeNull();
    expect(upsertedMission.id).not.toBeNull();
    expect(upsertedMission.version).toEqual(1);

    //check if it was added to the db
    await Mikro.getORM();
    const em = Mikro.getEM();
    const missionReference = em.getReference(Mission_db, upsertedMission.id);
    expect(missionReference).not.toBeNull();
    await Mikro.closeORM();

    newMission.id = upsertedMission.id;
    newMission.version = upsertedMission.version;
  });

  test("Mission upsertMission(): Update a mission", async () => {
    newMission.name = "Mission Jest Test Modified";
    const upsertedMission = await upsertMission(newMission);
    expect(upsertedMission).not.toBeNull();
    expect(upsertedMission.version).toEqual(2);
    expect(upsertedMission.name).toEqual("Mission Jest Test Modified");
  });

  test("Mission deleteMission(): Delete a mission", async () => {
    const referenceId = await deleteMission(newMission.id);
    expect(referenceId.id).toEqual(newMission.id);
  });
});

afterAll(async () => {
  //Cleanup our Database
  await Mikro.getORM();
  const em = Mikro.getEM();
  await em.nativeDelete(Mission_db, { id: testMission.id });
  await em.nativeDelete(User_db, { id: testAdmin.id });
  for (let i = 0; i < multipleMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: multipleMissions[i].id });
  }
  // Closing the DB connection allows Jest to exit successfully.
  await Mikro.closeORM();
});
