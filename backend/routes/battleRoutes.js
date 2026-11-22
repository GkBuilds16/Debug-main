import express from "express";

import {
getLiveBattles,
getBattleById,
joinBattle,
submitBattleSolution,
getBattleLeaderboard,
getGlobalBattleLeaderboard,
getBattleSubmissions
} from "../controllers/battleController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getLiveBattles);

router.get(
  "/submissions/:id",
  protect,
  getBattleSubmissions
);

router.get("/leaderboard/:id", getBattleLeaderboard);

router.get("/global-leaderboard", getGlobalBattleLeaderboard);

router.get("/:id", getBattleById);

router.post("/join/:id", protect, joinBattle);

router.post("/submit/:id", protect, submitBattleSolution);

export default router;
