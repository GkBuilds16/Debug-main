import request from "supertest";
import app from "../../app.js";
import User from "../../models/User.js";

import {
  connectDB,
  closeDB,
  clearDB
} from "../setup/mongoSetup.js";

beforeAll(async () => {
  await connectDB();
});

afterEach(async () => {
  await clearDB();
});

afterAll(async () => {
  await closeDB();
});
test("cannot access profile without token", async () => {

  const res = await request(app)
    .get("/api/users/me");

  expect(res.status).toBe(401);

});

test("rejects state-changing API requests from an untrusted origin", async () => {
  const res = await request(app)
    .post("/api/auth/logout")
    .set("Origin", "https://attacker.example");

  expect(res.status).toBe(403);
});

test.each(["http://localhost:5173", "http://127.0.0.1:5173"])("allows credentialed Vite preflight for %s", async (origin) => {
  const res = await request(app)
    .options("/api/auth/register")
    .set("Origin", origin)
    .set("Access-Control-Request-Method", "POST")
    .set("Access-Control-Request-Headers", "content-type");

  expect(res.status).toBe(204);
  expect(res.headers["access-control-allow-origin"]).toBe(origin);
  expect(res.headers["access-control-allow-credentials"]).toBe("true");
  expect(res.headers["access-control-allow-methods"]).toMatch(/POST/);
  expect(res.headers["access-control-allow-headers"]).toMatch(/content-type/i);
});

test("credentialed signup reaches the route after CORS preflight", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .set("Origin", "http://localhost:5173")
    .send({});

  expect(res.status).toBe(400);
  expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  expect(res.headers["access-control-allow-credentials"]).toBe("true");
  expect(res.body.message).toMatch(/required/i);
});

test("credentialed login reaches the route after CORS preflight", async () => {
  const res = await request(app)
    .post("/api/auth/login")
    .set("Origin", "http://localhost:5173")
    .send({});

  expect(res.status).toBe(400);
  expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  expect(res.headers["access-control-allow-credentials"]).toBe("true");
  expect(res.body.message).toMatch(/required/i);
});
test("invalid jwt rejected", async () => {

  const res = await request(app)
    .get("/api/users/me")
    .set(
      "Authorization",
      "Bearer invalid-token"
    );

  expect(res.status).toBe(401);

});
test("non-admin cannot access admin users route", async () => {

  await User.create({
    name: "Normal User",
    email: "user@gmail.com",
    password: "Password123"
  });

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({
      email: "user@gmail.com",
      password: "Password123"
    });

  const cookies =
    loginRes.headers["set-cookie"];

  const res = await request(app)
    .get("/api/users")
    .set("Cookie", cookies);

  expect(res.status).toBe(403);

});
test("invalid battle id returns 400", async () => {

  const res = await request(app)
    .get("/api/battles/abc");

  expect(res.status).toBe(400);

});
