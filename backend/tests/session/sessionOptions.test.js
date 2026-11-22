import { expect, test } from "@jest/globals";
import { createSessionOptions, OAUTH_SESSION_TTL_MS } from "../../config/sessionOptions.js";

test("uses persistent session storage and secure short-lived production cookies", () => {
  const options = createSessionOptions({ NODE_ENV: "production", SESSION_SECRET: "session-test-secret" });
  expect(options.store).toBeDefined();
  expect(options.resave).toBe(false);
  expect(options.saveUninitialized).toBe(false);
  expect(options.cookie).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: OAUTH_SESSION_TTL_MS,
  });
});

test("keeps local development sessions usable over HTTP", () => {
  expect(createSessionOptions({ NODE_ENV: "development", SESSION_SECRET: "dev-session-secret" }).cookie.secure).toBe(false);
});
