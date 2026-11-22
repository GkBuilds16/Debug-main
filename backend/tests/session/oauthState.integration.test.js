import process from "node:process";
import request from "supertest";
import { afterAll, afterEach, beforeAll, expect, test } from "@jest/globals";
import mongoose from "mongoose";

process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.GOOGLE_CALLBACK_URL = "http://localhost:5000/api/auth/google/callback";

const { default: app } = await import("../../app.js");
const { clearDB, closeDB, connectDB } = await import("../setup/mongoSetup.js");

beforeAll(async () => connectDB());
afterEach(async () => {
  await clearDB();
  await mongoose.connection.db.collection("oauth_sessions").deleteMany({});
});
afterAll(async () => closeDB());

test("persists Passport OAuth state and rejects a callback with a mismatched state", async () => {
  const start = await request(app).get("/api/auth/google");
  expect(start.status).toBe(302);
  const authorizationUrl = new URL(start.headers.location);
  const state = authorizationUrl.searchParams.get("state");
  expect(state).toBeTruthy();
  expect(authorizationUrl.hostname).toBe("accounts.google.com");

  const sessionCookie = start.headers["set-cookie"].find(cookie => cookie.startsWith("debugdsa.sid="));
  expect(sessionCookie).toContain("HttpOnly");
  expect(sessionCookie).toContain("SameSite=Lax");
  const storedSessions = await mongoose.connection.db.collection("oauth_sessions").countDocuments();
  expect(storedSessions).toBe(1);

  const callback = await request(app)
    .get("/api/auth/google/callback?code=not-a-real-code&state=incorrect-state")
    .set("Cookie", sessionCookie.split(";")[0]);
  expect(callback.status).toBe(403);
});
