import express from "express";
import request from "supertest";
import { authRateLimitKeyGenerator, createAuthRateLimiters } from "../../middleware/authRateLimiters.js";

test("localhost and IPv4 loopback share the local auth attempt key without trusting headers", () => {
  expect(authRateLimitKeyGenerator({ ip: "::1" })).toBe("local-loopback");
  expect(authRateLimitKeyGenerator({ ip: "127.0.0.1" })).toBe("local-loopback");
  expect(authRateLimitKeyGenerator({ ip: "::ffff:127.0.0.1" })).toBe("local-loopback");
  expect(authRateLimitKeyGenerator({ ip: "203.0.113.9", headers: { "x-forwarded-for": "127.0.0.1" } }))
    .not.toBe("local-loopback");
});

function createTestApp() {
  const app = express();
  const { registerLimiter, loginLimiter } = createAuthRateLimiters();

  app.options("/api/auth/register", (_req, res) => res.sendStatus(204));
  app.options("/api/auth/login", (_req, res) => res.sendStatus(204));
  app.post("/api/auth/register", registerLimiter, (_req, res) => res.status(201).json({ success: true }));
  app.post("/api/auth/login", loginLimiter, (_req, res) => res.status(200).json({ success: true }));
  return app;
}

test("registration succeeds within the configured limit and returns retry guidance after it", async () => {
  const app = createTestApp();
  let last;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    last = await request(app).post("/api/auth/register");
    expect(last.status).toBe(201);
  }

  const limited = await request(app).post("/api/auth/register");
  expect(limited.status).toBe(429);
  expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  expect(limited.body).toMatchObject({ success: false });
  expect(limited.body.retryAfterSeconds).toBeGreaterThan(0);
  expect(limited.body.message).toMatch(/registration attempts/i);
});

test("OPTIONS preflight does not consume registration allowance", async () => {
  const app = createTestApp();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    expect((await request(app).options("/api/auth/register")).status).toBe(204);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    expect((await request(app).post("/api/auth/register")).status).toBe(201);
  }
  expect((await request(app).post("/api/auth/register")).status).toBe(429);
});

test("registration and login have independent attempt limits", async () => {
  const app = createTestApp();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    expect((await request(app).post("/api/auth/register")).status).toBe(201);
  }
  expect((await request(app).post("/api/auth/register")).status).toBe(429);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    expect((await request(app).post("/api/auth/login")).status).toBe(200);
  }
  const limitedLogin = await request(app).post("/api/auth/login");
  expect(limitedLogin.status).toBe(429);
  expect(limitedLogin.body.message).toMatch(/login attempts/i);
});
