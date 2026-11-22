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

describe("Login Integration Tests", () => {

  test("successful login", async () => {

    await User.create({
      name: "Test User",
      email: "test@gmail.com",
      password: "Password123"
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "test@gmail.com",
        password: "Password123"
      });

    expect(res.status).toBe(200);

    expect(res.body.success).toBe(true);

  });

  test("login accepts email case and surrounding whitespace consistently", async () => {
    await User.create({ name: "Test User", email: "test@example.com", password: "Password123" });
    const res = await request(app).post("/api/auth/login").send({ email: " TEST@Example.com ", password: "Password123" });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("test@example.com");
  });

  test("login cookie persists to protected profile route", async () => {
    await User.create({ name: "Session User", email: "session@example.com", password: "Password123" });
    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({ email: "session@example.com", password: "Password123" });
    expect(login.status).toBe(200);
    const profile = await agent.get("/api/users/me");
    expect(profile.status).toBe(200);
    expect(profile.body.user.email).toBe("session@example.com");
  });

  test("nonexistent user rejected", async () => {

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "unknown@gmail.com",
        password: "Password123"
      });

    expect(res.status).toBe(401);

    expect(res.body.success).toBe(false);

  });

  test("wrong password rejected", async () => {

    await User.create({
      name: "Test User",
      email: "test@gmail.com",
      password: "Password123"
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "test@gmail.com",
        password: "WrongPassword"
      });

    expect(res.status).toBe(401);

    expect(res.body.success).toBe(false);

  });

  test("login sets auth cookies", async () => {

    await User.create({
      name: "Cookie User",
      email: "cookie@gmail.com",
      password: "Password123"
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "cookie@gmail.com",
        password: "Password123"
      });

    expect(res.status).toBe(200);

    expect(
      res.headers["set-cookie"]
    ).toBeDefined();

  });

  test("locks the account after repeated failed passwords", async () => {
    await User.create({ name: "Locked User", email: "locked@example.com", password: "Password123" });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await request(app).post("/api/auth/login").send({ email: "locked@example.com", password: "wrong-password" });
      expect(failed.status).toBe(401);
    }
    const locked = await request(app).post("/api/auth/login").send({ email: "locked@example.com", password: "Password123" });
    expect(locked.status).toBe(423);
  });

});
test("refresh token stored in database after login", async () => {

  const user = await User.create({
    name: "Refresh User",
    email: "refresh@gmail.com",
    password: "Password123"
  });

  await request(app)
    .post("/api/auth/login")
    .send({
      email: "refresh@gmail.com",
      password: "Password123"
    });

  const updatedUser = await User.findById(user._id)
    .select("+refreshToken");

  expect(updatedUser.refreshToken)
    .toBeDefined();

});
