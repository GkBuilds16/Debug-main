import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getOverallLeaderboard,
  getDsaLeaderboard,
  getDevLeaderboard,
  getMyCompetitiveStats
} from "../controllers/competitiveLeaderboardController.js";

const router = express.Router();
router.get("/overall", getOverallLeaderboard);
router.get("/dsa", getDsaLeaderboard);
router.get("/dev", getDevLeaderboard);
router.get("/me", protect, getMyCompetitiveStats);

export default router;
