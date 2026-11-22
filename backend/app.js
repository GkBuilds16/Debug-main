// backend/app.js
import "./config/env.js";
import "./config/redis.js";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import cors from "cors";
import passport from "./config/passport.js";
import session from "express-session";
import { createSessionOptions } from "./config/sessionOptions.js";
import { originGuard } from "./middleware/originGuard.js";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import leaderboardRoutes from "./routes/leaderboardRoutes.js";
import bugRoutes from "./routes/bugRoutes.js";
import solutionRoutes from "./routes/solutionRoutes.js";
import battleRoutes from "./routes/battleRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import runCodeRoutes from "./routes/runCode.js";
import certificateRoutes from "./routes/certificateRoutes.js";
import recommendationRoutes from "./routes/recommendationRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import devPostCodebaseRoutes from "./devMode/modules/post-codebase/routes.js";
import devViewCodebasesRoutes from "./devMode/modules/view-codebases/routes.js";
import devBattleRoutes from "./devMode/modules/battles/routes.js";
const app = express();

const configuredOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : [];
const localOrigins = process.env.NODE_ENV === "production"
  ? []
  : ["http://localhost:3000", "http://localhost:3001", "http://localhost:5173", "http://127.0.0.1:5173"];
const allowedOrigins = [...new Set([...localOrigins, ...configuredOrigins])];

//////////////////////////////////////////////////
// SECURITY
//////////////////////////////////////////////////

app.use(
  helmet({
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

//////////////////////////////////////////////////
// CORS
//////////////////////////////////////////////////

app.use(
  "/api",
  originGuard(allowedOrigins)
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin} is not allowed`));
      }
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  })
);

//////////////////////////////////////////////////
// RATE LIMIT
//////////////////////////////////////////////////

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS" || ["/auth/register", "/auth/login"].includes(req.path),
  handler: (_req, res) => res.status(429).json({
    success: false,
    message: "Too many API requests. Please retry after the Retry-After interval."
  }),
});

app.use("/api", limiter);

//////////////////////////////////////////////////
// BODY PARSER
//////////////////////////////////////////////////

app.use("/api/dev/v1", express.json({ limit: "4mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//////////////////////////////////////////////////
// COOKIE PARSER
//////////////////////////////////////////////////

app.use(cookieParser());

//////////////////////////////////////////////////
// SESSION
//////////////////////////////////////////////////

app.use(session(createSessionOptions()));

//////////////////////////////////////////////////
// PASSPORT
//////////////////////////////////////////////////

app.use(passport.initialize());
app.use(passport.session());

//////////////////////////////////////////////////
// LOGGER
//////////////////////////////////////////////////

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

//////////////////////////////////////////////////
// ROUTES
//////////////////////////////////////////////////

app.use("/api/auth", authRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/users", userRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/bugs", bugRoutes);
app.use("/api/solutions", solutionRoutes);
app.use("/api/battles", battleRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/code", runCodeRoutes);
app.use("/api/certificate", certificateRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use(
  "/api/search",
  searchRoutes
);
app.use("/api/dev/v1/creator", devPostCodebaseRoutes);
app.use("/api/dev/v1/view", devViewCodebasesRoutes);
app.use("/api/dev/v1/battles", devBattleRoutes);
//////////////////////////////////////////////////
// HEALTH CHECK
//////////////////////////////////////////////////

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
  });
});

//////////////////////////////////////////////////
// ROOT
//////////////////////////////////////////////////

app.get("/", (req, res) => {
  res.send("Backend working 🚀");
});

//////////////////////////////////////////////////
// 404
//////////////////////////////////////////////////

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

//////////////////////////////////////////////////
// GLOBAL ERROR
//////////////////////////////////////////////////

app.use((err, req, res, next) => {
  const statusCode = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600
    ? err.statusCode
    : 500;
  console.error(JSON.stringify({
    level: "error",
    name: err.name || "Error",
    code: err.code || "INTERNAL_ERROR",
    path: req.path
  }));

  res.status(statusCode).json({
    message: statusCode >= 500 ? "Internal server error" : (err.message || "Request failed"),
  });
});

export default app;
