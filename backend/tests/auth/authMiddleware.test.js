import request from "supertest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import app from "../../app.js";
import User from "../../models/User.js";

describe("Auth Middleware", () => {

  test("GET /api/users/me without token returns 401", async () => {

    const res = await request(app)
      .get("/api/users/me");

    expect(res.status).toBe(401);

  });

  test("GET /api/users/me with invalid token returns 401", async () => {

    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", "Bearer invalid_token");

    expect(res.status).toBe(401);

  });

  test("database lookup failures remain 500 instead of being mislabeled as invalid sessions", async () => {
    const token = jwt.sign({ id: new mongoose.Types.ObjectId().toString() }, process.env.JWT_SECRET);
    const findById = jest.spyOn(User, "findById").mockReturnValue({
      select: () => Promise.reject(Object.assign(new Error("database unavailable"), { name: "MongoNetworkError" }))
    });

    try {
      const res = await request(app)
        .get("/api/users/me")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(500);
      expect(res.body.message).toBe("Internal server error");
    } finally {
      findById.mockRestore();
    }
  });

});
