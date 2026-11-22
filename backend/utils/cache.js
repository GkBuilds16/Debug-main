import redisClient from "../config/redis.js";

export const clearLeaderboardCache = async () => {
  if (!redisClient.isOpen) return;
  await redisClient.del("leaderboard");
};

export const clearUserCache = async (userId) => {
  if (!redisClient.isOpen) return;
  await redisClient.del(`user:${userId}`);
};