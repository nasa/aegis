import express from "express";
import * as prometheus from "prom-client";
import supertest from "supertest";

import metricsRoutes from "server/express/routes/metrics";

const app = express();
app.use("/api/v1/metrics", metricsRoutes);

const originalEmssToken = process.env.EMSS_TOKEN;

beforeEach(() => {
  process.env.EMSS_TOKEN = "test-emss-token";
});

afterAll(() => {
  if (originalEmssToken === undefined) {
    delete process.env.EMSS_TOKEN;
  } else {
    process.env.EMSS_TOKEN = originalEmssToken;
  }
});

describe("Metrics API Endpoint", () => {
  test("Returns 401 when the API key is missing", async () => {
    const res = await supertest(app).get("/api/v1/metrics");

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "missing API key" });
  });

  test("Returns 500 when EMSS_TOKEN is not configured", async () => {
    delete process.env.EMSS_TOKEN;

    const res = await supertest(app).get("/api/v1/metrics").set("X-API-Key", "test-emss-token");

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "unable to verify API key" });
  });

  test("Returns 403 when the API key is invalid", async () => {
    const res = await supertest(app).get("/api/v1/metrics").set("X-API-Key", "invalid-token");

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "invalid API key" });
  });

  test("Returns Prometheus default metrics for a valid API key", async () => {
    const res = await supertest(app).get("/api/v1/metrics").set("X-API-Key", "test-emss-token");

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe(prometheus.register.contentType);
    expect(res.text).toContain("# HELP process_cpu_user_seconds_total");
  });
});
