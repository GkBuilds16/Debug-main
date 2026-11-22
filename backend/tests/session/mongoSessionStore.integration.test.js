import { afterAll, afterEach, beforeAll, expect, test } from "@jest/globals";
import mongoose from "mongoose";
import { MongoSessionStore } from "../../config/mongoSessionStore.js";
import { clearDB, closeDB, connectDB } from "../setup/mongoSetup.js";

function callStore(store, method, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (error, value) => error ? reject(error) : resolve(value));
  });
}

beforeAll(async () => connectDB());
afterEach(async () => {
  await clearDB();
  await mongoose.connection.db.collection("session_persistence_tests").deleteMany({});
  await mongoose.connection.db.collection("session_expiration_tests").deleteMany({});
});
afterAll(async () => closeDB());

test("persists a session across store instances and creates a Mongo TTL index", async () => {
  const firstStore = new MongoSessionStore({ collectionName: "session_persistence_tests" });
  const session = {
    cookie: { expires: new Date(Date.now() + 60_000), httpOnly: true, sameSite: "lax" },
    passport: { state: "oauth-state-value" },
  };
  await callStore(firstStore, "set", "persistent-session-id", session);

  const restartedStore = new MongoSessionStore({ collectionName: "session_persistence_tests" });
  await expect(callStore(restartedStore, "get", "persistent-session-id")).resolves.toEqual(session);
  const indexes = await mongoose.connection.db.collection("session_persistence_tests").listIndexes().toArray();
  expect(indexes).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "oauth_session_ttl", expireAfterSeconds: 0 }),
  ]));
});

test("returns expired sessions as missing and supports destroy", async () => {
  const store = new MongoSessionStore({ collectionName: "session_expiration_tests" });
  await callStore(store, "set", "expired-session-id", {
    cookie: { expires: new Date(Date.now() - 1000) },
    passport: { state: "expired" },
  });
  await expect(callStore(store, "get", "expired-session-id")).resolves.toBeNull();
  await callStore(store, "set", "destroyed-session-id", { cookie: { expires: new Date(Date.now() + 60_000) } });
  await callStore(store, "destroy", "destroyed-session-id");
  await expect(callStore(store, "get", "destroyed-session-id")).resolves.toBeNull();
});
