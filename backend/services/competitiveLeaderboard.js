import Battle from "../models/battle.js";
import DevBattle from "../devMode/models/DevBattle.js";
import DevBattleSubmission from "../devMode/models/DevBattleSubmission.js";
import User from "../models/User.js";
import { rankDsaBattle, rankVerifiedDevBattle } from "./competitiveScoring.js";

async function dsaResults(now) {
  const battles = await Battle.aggregate([
    { $match: { endTime: { $lte: now }, status: { $ne: "CANCELLED" } } },
    { $unwind: "$submissions" },
    { $match: { "submissions.user": { $ne: null }, "submissions.late": { $ne: true }, "submissions.submittedAt": { $lte: now } } },
    { $group: { _id: "$_id", title: { $first: "$title" }, endTime: { $first: "$endTime" }, submissions: { $push: "$submissions" } } }
  ]);
  return battles.flatMap(battle => rankDsaBattle(battle).map(result => ({
    ...result,
    battleId: String(battle._id),
    title: battle.title,
    mode: "DSA",
    completedAt: battle.endTime
  })));
}

async function devResults(now) {
  const submissions = await DevBattleSubmission.aggregate([
    { $match: { evaluationStatus: "EVALUATED", "result.verified": true, "result.valid": true } },
    { $lookup: { from: DevBattle.collection.name, localField: "battleId", foreignField: "_id", as: "battle" } },
    { $unwind: "$battle" },
    { $match: { "battle.status": { $nin: ["DRAFT", "CANCELLED"] }, $expr: { $lte: [{ $add: ["$battle.startsAt", { $multiply: ["$battle.durationMinutes", 60000] }] }, now] } } },
    { $project: { battleId: 1, userId: 1, evaluationStatus: 1, result: 1, title: "$battle.title", completedAt: { $add: ["$battle.startsAt", { $multiply: ["$battle.durationMinutes", 60000] }] } } }
  ]);
  const grouped = new Map();
  for (const submission of submissions) {
    const key = String(submission.battleId);
    const list = grouped.get(key) || { battleId: key, title: submission.title, completedAt: submission.completedAt, submissions: [] };
    list.submissions.push(submission);
    grouped.set(key, list);
  }
  return [...grouped.values()].flatMap(battle => rankVerifiedDevBattle(battle.submissions).map(result => ({
    ...result,
    battleId: battle.battleId,
    title: battle.title,
    mode: "DEV",
    completedAt: battle.completedAt
  })));
}

const emptyStats = id => ({
  _id: id,
  points: 0,
  dsaPoints: 0,
  devPoints: 0,
  totalBattles: 0,
  totalWins: 0,
  winRate: 0
});

export async function calculateCompetitiveResults(now = new Date()) {
  const [dsa, dev] = await Promise.all([dsaResults(now), devResults(now)]);
  return [...dsa, ...dev].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
}

export function summarizeCompetitiveResults(results, userIds) {
  const allowed = userIds ? new Set(userIds.map(String)) : null;
  const byUser = new Map();
  for (const result of results) {
    if (allowed && !allowed.has(String(result.userId))) continue;
    const stats = byUser.get(String(result.userId)) || emptyStats(String(result.userId));
    stats.points += result.points;
    stats[ result.mode === "DSA" ? "dsaPoints" : "devPoints" ] += result.points;
    stats.totalBattles += 1;
    if (result.won) stats.totalWins += 1;
    stats.recentResults ||= [];
    if (stats.recentResults.length < 10) stats.recentResults.push(result);
    byUser.set(String(result.userId), stats);
  }
  for (const stats of byUser.values()) stats.winRate = stats.totalBattles ? Math.round((stats.totalWins / stats.totalBattles) * 10000) / 100 : 0;
  return [...byUser.values()];
}

export async function getCompetitiveLeaderboard(mode = "overall", currentUserId = null) {
  const now = new Date();
  const durationEnd = { $add: ["$startsAt", { $multiply: ["$durationMinutes", 60000] }] };
  const [results, completedDsaBattles, completedDevBattles] = await Promise.all([
    calculateCompetitiveResults(now),
    Battle.countDocuments({ endTime: { $lte: now }, status: { $ne: "CANCELLED" } }),
    DevBattle.countDocuments({ status: { $nin: ["DRAFT", "CANCELLED"] }, $expr: { $lte: [durationEnd, now] } })
  ]);
  const overallStats = summarizeCompetitiveResults(results);
  const summary = {
    totalCompetitors: overallStats.length,
    totalCompletedBattles: completedDsaBattles + completedDevBattles,
    totalDsaPointsAwarded: overallStats.reduce((total, item) => total + item.dsaPoints, 0),
    totalDevPointsAwarded: overallStats.reduce((total, item) => total + item.devPoints, 0)
  };
  const filtered = results.filter(result => mode === "overall" || result.mode === mode.toUpperCase());
  const stats = summarizeCompetitiveResults(filtered).sort((a, b) => b.points - a.points || b.totalWins - a.totalWins || a._id.localeCompare(b._id));
  const ranked = stats.map((item, index) => {
    const rank = index > 0 && stats[index - 1].points === item.points ? undefined : index + 1;
    return { ...item, rank: rank || null };
  });
  for (let index = 0; index < ranked.length; index += 1) {
    if (ranked[index].rank === null) ranked[index].rank = ranked[index - 1].rank;
  }
  const ids = currentUserId ? [String(currentUserId)] : ranked.slice(0, 50).map(item => item._id);
  const users = ids.length ? await User.find({ _id: { $in: ids } }).select("name").lean() : [];
  const usersById = new Map(users.map(user => [String(user._id), user]));
  const namedRanked = ranked.map(item => {
    const user = usersById.get(item._id);
    return { ...item, name: user?.name || "DebugDSA user" };
  });
  if (currentUserId) {
    const mine = namedRanked.find(item => item._id === String(currentUserId)) || { ...emptyStats(String(currentUserId)), rank: null, name: "" };
    return { ...mine, recentResults: mine.recentResults || [] };
  }
  return { users: namedRanked.slice(0, 50), summary, pagination: { limit: 50, total: stats.length, hasMore: stats.length > 50 } };
}

