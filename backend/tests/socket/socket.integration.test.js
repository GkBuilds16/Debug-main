import request from "supertest";
import { io as Client } from "socket.io-client";
import jwt from "jsonwebtoken";

import app from "../../app.js";
import { server } from "../../server.js";

import User from "../../models/User.js";
import Battle from "../../models/battle.js";

import {
  connectDB,
  clearDB,
  closeDB
} from "../setup/mongoSetup.js";

beforeAll(async () => {

  await connectDB();

  await new Promise(resolve =>
    server.listen(5001, resolve)
  );

});

afterEach(async () => {
  await clearDB();
});

afterAll(async () => {

  await closeDB();

  await new Promise(resolve =>
    server.close(resolve)
  );

});

test("rejects unauthenticated socket clients", async () => {
  const client = Client("http://localhost:5001", { reconnection: false, timeout: 3000 });
  await new Promise((resolve, reject) => {
    client.once("connect_error", (error) => {
      expect(error.message).toBe("Authentication required");
      resolve();
    });
    client.once("connect", () => reject(new Error("Unauthenticated socket connected")));
  });
  client.disconnect();
});

test("rejects authenticated socket clients from an untrusted browser origin", async () => {
  const user = await User.create({ name: "Socket User", email: "socket-origin@example.com", password: "password123" });
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1m" });
  const client = Client("http://localhost:5001", {
    auth: { token },
    extraHeaders: { Origin: "https://attacker.example" },
    reconnection: false,
    timeout: 3000
  });
  await new Promise((resolve, reject) => {
    client.once("connect_error", (error) => {
      expect(error.message).toBe("Origin is not allowed");
      resolve();
    });
    client.once("connect", () => reject(new Error("Untrusted origin connected")));
  });
  client.disconnect();
});

test("authenticated clients can join only battles they registered for", async () => {
  const user = await User.create({ name: "Socket User", email: "socket@example.com", password: "password123" });
  const battle = await Battle.create({
    title: "Socket Battle", description: "Test battle", startTime: new Date(Date.now() - 60_000),
    endTime: new Date(Date.now() + 60_000), participants: [user._id]
  });
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1m" });
  const client = Client("http://localhost:5001", { auth: { token }, reconnection: false });
  await new Promise((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });
  const joined = await new Promise((resolve) => client.emit("joinBattleRoom", String(battle._id), resolve));
  expect(joined).toEqual({ success: true });
  const denied = await new Promise((resolve) => client.emit("joinBattleRoom", "000000000000000000000000", resolve));
  expect(denied.success).toBe(false);
  client.disconnect();
});
