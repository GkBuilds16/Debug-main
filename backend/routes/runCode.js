import express from "express";
import rateLimit from "express-rate-limit";

import {
  protect
} from "../middleware/authMiddleware.js";

import {
  runCode
} from "../controllers/runCodeController.js";

const router = express.Router();
const executionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many code executions. Please try again in a minute." },
});

//////////////////////////////////////////////////
// RUN CODE
//////////////////////////////////////////////////

router.post(
  "/run",
  protect,
  executionLimiter,
  runCode
);

export default router;
