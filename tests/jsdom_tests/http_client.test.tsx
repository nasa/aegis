import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { getMission, getMissions, isLoggedIn, login, logout } from "../../http-client/internal-api";
import Mikro from "../../utils/mikro";
import UserFactory from "../helpers/UserFactory";
import MissionFactory from "../helpers/MissionFactory";
import { Mission } from "../../server/database/models/mission.model";
import { User } from "../../server/database/models/user.model";
import fetchMock from "jest-fetch-mock";

fetchMock.enableMocks();
let testMission: Mission;
let testAdmin: User;
let multipleMissions: Mission[];

beforeAll(async () => {
  await Mikro.getORM();
  fetchMock.resetMocks();
  const model = await Mikro.getEM();
  testAdmin = await new UserFactory(model).createOne();
  testMission = await new MissionFactory(model).createOne();
  multipleMissions = await new MissionFactory(model).create(5);
  await Mikro.closeORM();
});

describe("Internal API", () => {
  //Get all missions Test
  test("Mission: Returns All Missions", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(multipleMissions));
    getMissions().then((res: WrappedResponse<Mission[]>) => {
      // we must convert the string dates to dates
      for (let i = 0; i < multipleMissions.length; i++) {
        res[i].createdAt = new Date(res[i].createdAt);
        res[i].updatedAt = new Date(res[i].updatedAt);
      }

      expect(res).toEqual(multipleMissions);
    });
  });

  //Get Mission Test
  test("Mission: Returns Mission", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([testMission]));
    getMission(testMission.id).then((res) => {
      expect(res[0].id).toEqual(testMission.id);
    });
  });

  // IsLoggedIn Test
  test("Mission: Returns IsLoggedIn", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(true));
    isLoggedIn().then((res) => {
      expect(res).toEqual(true);
    });
  });
  // Login Test
  test("Mission: Returns Login", async () => {
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

  test("Mission: Fails Login", async () => {
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
  test("Mission: Returns Logout", async () => {
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

afterAll(async () => {
  //Cleanup our Database
  await Mikro.getORM();
  const model = await Mikro.getEM();
  await model.nativeDelete(Mission, { id: testMission.id });
  await model.nativeDelete(User, { id: testAdmin.id });
  for (let i = 0; i < multipleMissions.length; i++) {
    await model.nativeDelete(Mission, { id: multipleMissions[i].id });
  }
  // Closing the DB connection allows Jest to exit successfully.
  await Mikro.closeORM();
});
