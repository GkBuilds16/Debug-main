import request from "supertest";
import app from "../../app.js";
import User from "../../models/User.js";
import { closeDB, connectDB, clearDB } from "../setup/mongoSetup.js";

let sequence = 0;

beforeAll(async () => connectDB());
afterEach(async () => clearDB());
afterAll(async () => closeDB());

async function createSession(points) {
  sequence += 1;
  const user = await User.create({
    name: "Certificate Test User",
    email: `certificate-${sequence}@example.test`,
    password: "CertificateTest123",
    points,
  });
  const login = await request(app).post("/api/auth/login").send({
    email: user.email,
    password: "CertificateTest123",
  });
  expect(login.status).toBe(200);
  return login.headers["set-cookie"];
}

describe("certificate downloads", () => {
  test("requires authentication and 100 points", async () => {
    expect((await request(app).get("/api/certificate/download")).status).toBe(401);
    const cookies = await createSession(99);
    const response = await request(app).get("/api/certificate/download").set("Cookie", cookies);
    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/100 points/i);
  });

  test.each([
    [100, "Bronze"],
    [250, "Silver"],
    [500, "Gold"],
  ])("creates a certificate at %s points", async (points) => {
    const cookies = await createSession(points);
    const response = await request(app).get("/api/certificate/download").set("Cookie", cookies);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/pdf/);
    expect(response.headers["content-disposition"]).toMatch(/DebugDSA-Certificate-/);
    expect(Buffer.isBuffer(response.body) ? response.body.subarray(0, 4).toString() : "").toBe("%PDF");
  });
});
