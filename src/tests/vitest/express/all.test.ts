import express from "express";
import supertest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import allRoutes from "server/express/routes/all";

const app = express();
app.use("/api/v1/all", allRoutes);

const originalEmssToken = process.env.EMSS_TOKEN;

describe("GET /api/v1/all", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EMSS_TOKEN = "test-emss-token";
  });

  afterAll(() => {
    if (originalEmssToken === undefined) {
      delete process.env.EMSS_TOKEN;
    } else {
      process.env.EMSS_TOKEN = originalEmssToken;
    }
  });

  it("should return 401 Unauthorized if user does not have view permissions", async () => {
    const res = await supertest(app)
      .get("/api/v1/all?missionId=123")
      .set("emss-token", "fake-token");

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ status: "failure", message: "Unauthorized" });
  });

  it("should return 400 if missionId is not provided", async () => {
    const res = await supertest(app).get("/api/v1/all").set("emss-token", "test-emss-token");

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ status: "error", message: "Invalid mission ID" });
  });
});
