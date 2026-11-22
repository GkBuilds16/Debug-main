import { createServer } from "node:http";
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requestObservability } from "../middleware/requestObservability.js";

const logLines = [];
const app = express();
app.use(requestObservability({ log: (line) => logLines.push(line) }));
app.use(express.json());
const aiRoutes = express.Router();
aiRoutes.post("/debug", protect, (_req, res) => res.sendStatus(200));
app.use("/api/ai", aiRoutes);

const server = createServer(app);
let origin;

beforeAll(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("logs unauthenticated AI requests with safe fields and a correlatable request ID", async () => {
  const response = await fetch(
    `${origin}/api/ai/debug?privateQuery=private-query-value`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "ApiKey private-auth-value",
        Cookie: "theme=private-cookie-value",
        "X-Api-Key": "private-api-key-value",
        "X-Request-Id": "untrusted-client-id",
      },
      body: JSON.stringify({ code: "private-body-value" }),
    },
  );

  expect(response.status).toBe(401);
  const requestId = response.headers.get("x-request-id");
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(logLines).toHaveLength(1);

  const log = JSON.parse(logLines[0]);
  expect(Object.keys(log).sort()).toEqual(["durationMs", "event", "method", "path", "requestId", "status"]);
  expect(log).toMatchObject({ event: "http.request", requestId, method: "POST", path: "/api/ai/debug", status: 401 });
  expect(typeof log.durationMs).toBe("number");

  for (const secret of [
    "private-query-value",
    "private-auth-value",
    "private-cookie-value",
    "private-api-key-value",
    "private-body-value",
    "untrusted-client-id",
  ]) {
    expect(logLines[0]).not.toContain(secret);
  }
});

test("uses a safe normalized path when no route matches", async () => {
  const response = await fetch(`${origin}/users/person@example.com?token=private-query-value`);
  expect(response.status).toBe(404);

  const log = JSON.parse(logLines[1]);
  expect(log.path).toBe("/unmatched");
  expect(log.status).toBe(404);
  expect(logLines[1]).not.toContain("person@example.com");
  expect(logLines[1]).not.toContain("private-query-value");
});
