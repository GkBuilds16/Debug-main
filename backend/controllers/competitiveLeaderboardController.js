import { getCompetitiveLeaderboard } from "../services/competitiveLeaderboard.js";

const handler = mode => async (req, res, next) => {
  try {
    res.json(await getCompetitiveLeaderboard(mode));
  } catch (error) {
    next(error);
  }
};

export const getOverallLeaderboard = handler("overall");
export const getDsaLeaderboard = handler("DSA");
export const getDevLeaderboard = handler("DEV");

export async function getMyCompetitiveStats(req, res, next) {
  try {
    res.json(await getCompetitiveLeaderboard("overall", req.user._id));
  } catch (error) {
    next(error);
  }
}
