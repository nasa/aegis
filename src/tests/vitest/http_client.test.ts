import { isLoggedIn, login, logout } from "http-client/login";

// Helper to mock fetch responses
const mockFetchResponse = (data: unknown) => {
  global.fetch = vi.fn().mockResolvedValueOnce({
    status: 200,
    json: () => Promise.resolve(data),
  } as unknown as Response);
};

describe("Login", () => {
  test("Returns IsLoggedIn", async () => {
    mockFetchResponse(true);
    const res = await isLoggedIn();
    expect(res).toEqual(true);
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
    mockFetchResponse(mockResponse);
    const res = await login(username, password);
    expect(res).toEqual(mockResponse);
  });

  test("Fails Login", async () => {
    const username: string = "fake_user";
    const password: string = "fake_password";
    const mockResponse = {
      status: "failure",
      message: "No such user.",
    };
    mockFetchResponse(mockResponse);
    const res = await login(username, password);
    expect(res).toEqual(mockResponse);
  });

  test("Returns Logout", async () => {
    const mockResponse = {
      status: "success",
      message: "Logged out",
      data: true,
    };
    mockFetchResponse(mockResponse);
    const res = await logout();
    expect(res).toEqual(mockResponse);
  });
});
