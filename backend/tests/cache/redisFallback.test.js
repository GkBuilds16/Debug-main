import { expect, test } from "@jest/globals";
import redisClient from "../../config/redis.js";
import { getCache, setCache } from "../../utils/redisCache.js";

test("treats unavailable optional Redis as a cache miss and skips writes", async () => {
  expect(redisClient.isOpen).toBe(false);
  await expect(getCache("not-configured")).resolves.toBeNull();
  await expect(setCache("not-configured", 30, "value")).resolves.toBeUndefined();
});
