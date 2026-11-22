import request from "supertest";
import app from "../../app.js";

import User from "../../models/User.js";
import Battle from "../../models/battle.js";

import {
  connectDB,
  clearDB,
  closeDB
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
test(
  "accepted submission appears in leaderboard",
  async () => {

    const user = await User.create({
      name: "Leader",
      email: "leader@gmail.com",
      password: "Password123"
    });

    const battle = await Battle.create({
      title: "Leaderboard Battle",
      startTime: new Date(Date.now() - 10000),
      endTime: new Date(Date.now() + 10000),
      submissions: [
        {
          user: user._id,
          code: "solution",
          status: "accepted",
          submittedAt: new Date(),
          late: false
        }
      ]
    });

    const res = await request(app)
      .get(
        `/api/battles/leaderboard/${battle._id}`
      );

    expect(res.status).toBe(200);

    expect(res.body.users.length).toBe(1);

  }
);

test("competitive DSA leaderboard scores a completed verified result once per user and battle", async () => {
  const user = await User.create({ name: "Verified Leader", email: "verified-leader@example.test", password: "Password123" });
  const now = Date.now();
  await Battle.create({
    title: "Completed verified battle",
    startTime: new Date(now - 120000),
    endTime: new Date(now - 60000),
    status: "FINISHED",
    participants: [user._id],
    submissions: [
      { user: user._id, code: "accepted first", status: "accepted", submittedAt: new Date(now - 90000), late: false },
      { user: user._id, code: "accepted duplicate", status: "accepted", submittedAt: new Date(now - 80000), late: false }
    ]
  });

  const result = await request(app).get("/api/leaderboard/dsa");
  expect(result.status).toBe(200);
  expect(result.body.users).toHaveLength(1);
  expect(result.body.users[0]).toMatchObject({ name: "Verified Leader", points: 100, dsaPoints: 100, totalBattles: 1, totalWins: 1 });
});

test("overall, DSA, Dev and authenticated personal leaderboard routes are mounted with stable response shapes", async () => {
  const user = await User.create({ name: "Stats User", email: "stats-user@example.test", password: "SafeTestPassword123!" });
  await Battle.create({
    title: "Stats result",
    startTime: new Date(Date.now() - 120000),
    endTime: new Date(Date.now() - 60000),
    submissions: [{ user: user._id, code: "verified", status: "accepted", submittedAt: new Date(Date.now() - 90000), late: false }]
  });

  const [overall, dsa, dev] = await Promise.all([
    request(app).get("/api/leaderboard/overall"),
    request(app).get("/api/leaderboard/dsa"),
    request(app).get("/api/leaderboard/dev")
  ]);
  expect(overall.status).toBe(200);
  expect(overall.body.users[0]).toMatchObject({ points: 100, dsaPoints: 100, devPoints: 0 });
  expect(overall.body.summary).toMatchObject({ totalCompetitors: 1, totalDsaPointsAwarded: 100, totalDevPointsAwarded: 0 });
  expect(dsa.body.users[0]).toMatchObject({ points: 100, dsaPoints: 100, devPoints: 0 });
  expect(dev.body.users).toEqual([]);
  expect(dev.body.summary.totalCompetitors).toBe(1);

  expect((await request(app).get("/api/leaderboard/me")).status).toBe(401);
  const login = await request(app).post("/api/auth/login").send({ email: "stats-user@example.test", password: "SafeTestPassword123!" });
  expect(login.status).toBe(200);
  const personal = await request(app).get("/api/leaderboard/me").set("Cookie", login.headers["set-cookie"]);
  expect(personal.status).toBe(200);
  expect(personal.body).toMatchObject({ points: 100, dsaPoints: 100, totalBattles: 1, totalWins: 1, rank: 1 });
  expect(personal.body.recentResults[0]).toMatchObject({ mode: "DSA", points: 100, won: true });
});
test(
  "late submissions excluded from leaderboard",
  async () => {

    const user = await User.create({
      name: "Late User",
      email: "late@gmail.com",
      password: "Password123"
    });

    const battle = await Battle.create({
      title: "Late Battle",
      startTime: new Date(Date.now() - 10000),
      endTime: new Date(Date.now() + 10000),
      submissions: [
        {
          user: user._id,
          code: "solution",
          status: "accepted",
          submittedAt: new Date(),
          late: true
        }
      ]
    });

    const res = await request(app)
      .get(
        `/api/battles/leaderboard/${battle._id}`
      );

    expect(res.status).toBe(200);

    expect(res.body.users.length).toBe(0);

  }
);
test(
  "pending submissions excluded from leaderboard",
  async () => {

    const user = await User.create({
      name: "Pending User",
      email: "pending@gmail.com",
      password: "Password123"
    });

    const battle = await Battle.create({
      title: "Pending Battle",
      startTime: new Date(Date.now() - 10000),
      endTime: new Date(Date.now() + 10000),
      submissions: [
        {
          user: user._id,
          code: "solution",
          status: "pending",
          submittedAt: new Date(),
          late: false
        }
      ]
    });

    const res = await request(app)
      .get(
        `/api/battles/leaderboard/${battle._id}`
      );

    expect(res.status).toBe(200);

    expect(res.body.users.length).toBe(0);

  }
);
test(
  "earliest accepted submission gets rank 1",
  async () => {

    const user1 = await User.create({
      name: "User1",
      email: "rank1@gmail.com",
      password: "Password123"
    });

    const user2 = await User.create({
      name: "User2",
      email: "rank2@gmail.com",
      password: "Password123"
    });

    const earlier =
      new Date(Date.now() - 10000);

    const later =
      new Date(Date.now() - 5000);

    const battle = await Battle.create({
      title: "Ranking Battle",
      startTime: new Date(Date.now() - 60000),
      endTime: new Date(Date.now() + 60000),

      submissions: [
        {
          user: user2._id,
          code: "solution2",
          status: "accepted",
          submittedAt: later,
          late: false
        },
        {
          user: user1._id,
          code: "solution1",
          status: "accepted",
          submittedAt: earlier,
          late: false
        }
      ]
    });

    const res = await request(app)
      .get(
        `/api/battles/leaderboard/${battle._id}`
      );

    expect(res.status).toBe(200);

    expect(res.body.users.length).toBe(2);  
    expect(res.body.users[0].rank)
  .toBe(1);

expect(res.body.users[0].user)
  .toBe("User1");

  }
);
import mongoose from "mongoose";

test(
  "nonexistent battle returns 404",
  async () => {

    const fakeBattleId =
      new mongoose.Types.ObjectId();

    const res = await request(app)
      .get(
        `/api/battles/leaderboard/${fakeBattleId}`
      );

    expect(res.status).toBe(404);

    expect(res.body.message)
      .toBe("Battle not found");

  }
);
