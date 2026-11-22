import redisClient from "../config/redis.js";

export async function getCache(key) {
  if (!redisClient.isOpen) return null;
  try {
    return await redisClient.get(key);
  } catch (error) {
    console.warn("Redis cache read failed:", error.message);
    return null;
  }
}

export async function setCache(key, seconds, value) {
  if (!redisClient.isOpen) return;
  try {
    await redisClient.setEx(key, seconds, value);
  } catch (error) {
    console.warn("Redis cache write failed:", error.message);
  }
}
