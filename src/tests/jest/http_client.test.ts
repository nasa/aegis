import { describe, expect, test } from "@jest/globals";
import { isLoggedIn, login, logout } from "http-client/login";
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
