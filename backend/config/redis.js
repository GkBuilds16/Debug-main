import { createClient } from "redis";

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("connect", () => {
  console.log("✅ Redis Connected");
});

redisClient.on("error", (err) => {
  console.error("❌ Redis Error:", err);
});

// Creator API integration tests do not exercise Redis-backed features. Avoid
// requiring a local Redis daemon for the host app's HTTP test harness.
if (process.env.NODE_ENV !== "test" && process.env.REDIS_URL?.trim()) {
  redisClient.connect().catch((error) => {
    console.error("Redis unavailable; continuing without cache:", error.message);
  });
}

export default redisClient;
