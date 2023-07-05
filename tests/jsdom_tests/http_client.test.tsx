import { describe, expect, test } from "@jest/globals";
import { isLoggedIn, login, logout } from "http-client/login";
import { getMissions } from "http-client/mission";
import fetchMock from "jest-fetch-mock";

//mock up the fetch calls and test front-end functionality only
fetchMock.enableMocks();

describe("Login", () => {
  test("Returns IsLoggedIn", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(true));
    isLoggedIn().then((res) => {
      expect(res).toEqual(true);
    });
  });

  test("Returns Login", async () => {
    const username: string = "test_username";
    const password: string = "test_password";
    const mockResponse = {
      status: "success",
      message: "login successful",
      data: {
        user: {
          id: 123,
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
    const password: string = "fake_password";
    const mockResponse = {
      status: "failure",
      message: "No such user.",
    };
    fetchMock.mockResponseOnce(JSON.stringify(mockResponse));
    login(username, password).then((res) => {
      expect(res).toEqual(mockResponse);
    });
  });

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
    const multipleMissions = [
      { name: "Test mission 1", id: 123 },
      { name: "Test mission 2", id: 234 },
    ];
    fetchMock.mockResponseOnce(JSON.stringify(multipleMissions));
    getMissions().then((res) => {
      expect(res).toEqual(multipleMissions);
    });
  });

  test("Mission: Returns Single Mission", async () => {
    const testMission = [{ name: "Test mission", id: 123 }];
    fetchMock.mockResponseOnce(JSON.stringify(testMission));
    getMissions(123).then((res) => {
      expect(res).toEqual(testMission);
    });
  });
});
