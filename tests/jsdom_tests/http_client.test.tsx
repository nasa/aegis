import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { isLoggedIn, login, logout } from "../../http-client/internal-api";
import Mikro from "../../utils/mikro";
import UserFactory from "../helpers/UserFactory";
import MissionFactory from "../helpers/MissionFactory";
import { Mission as Mission_db } from "../../server/database/models/mission.model";
import { getMissions } from "../../http-client/mission";
import { User as User_db } from "../../server/database/models/user.model";
import fetchMock from "jest-fetch-mock";

fetchMock.enableMocks();
let testMission: Mission_db;
let testAdmin: User_db;
let multipleMissions: Mission_db[];

beforeAll(async () => {
  await Mikro.getORM();
  fetchMock.resetMocks();
  const em = Mikro.getEM();
  testAdmin = await new UserFactory(em).createOne();
  testMission = await new MissionFactory(em).createOne();
  multipleMissions = await new MissionFactory(em).create(5);
  await Mikro.closeORM();
});

describe("Internal API", () => {
  // IsLoggedIn Test
  test("Returns IsLoggedIn", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(true));
    isLoggedIn().then((res) => {
      expect(res).toEqual(true);
    });
  });

  // Login Test
  test("Returns Login", async () => {
    const username: string = testAdmin.username;
    const password: string = testAdmin.password;
    const mockResponse = {
      status: "success",
      message: "login successful",
      data: {
        user: {
          id: testAdmin.id,
          permission: "admin",
          username: username,
        },
      },
    };
    fetchMock.mockResponseOnce(JSON.stringify(mockResponse));
    login(username, password).then((res) => {
      expect(res).toEqual(mockResponse);
    });
  });

  test("Fails Login", async () => {
    const username: string = "fake_user";
    const password: string = testAdmin.password;
    const mockResponse = {
      status: "failure",
      message: "No suck user.",
    };
    fetchMock.mockResponseOnce(JSON.stringify(mockResponse));
    login(username, password).then((res) => {
      expect(res).toEqual(mockResponse);
    });
  });

  // Logout Test
  test("Returns Logout", async () => {
    const mockResponse = {
      status: "success",
      message: "Logged out",
      data: true,
    };
    fetchMock.mockResponseOnce(JSON.stringify(mockResponse));
    logout().then((res) => {
      expect(res).toEqual(mockResponse);
    });
  });
});

describe("Mission", () => {
  test("Mission: Returns All Missions", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(multipleMissions));
    getMissions().then((res: WrappedResponse<Mission_db[]>) => {
      // we must convert the string dates to dates
      for (let i = 0; i < multipleMissions.length; i++) {
        res[i].createdAt = new Date(res[i].createdAt);
        res[i].updatedAt = new Date(res[i].updatedAt);
      }

      expect(res).toEqual(multipleMissions);
    });
  });

  test("Mission: Returns Single Mission", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([testMission]));
    getMissions(testMission.id).then((res) => {
      expect(res[0].id).toEqual(testMission.id);
    });
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
