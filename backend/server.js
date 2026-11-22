import "./config/env.js";

import express from "express";
import mongoose from "mongoose";
import redisClient from "./config/redis.js";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import cors from "cors";
import passport from "./config/passport.js";
import session from "express-session";
import { mongoSessionStore } from "./config/mongoSessionStore.js";
import { createSessionOptions } from "./config/sessionOptions.js";
import { requestObservability } from "./middleware/requestObservability.js";
import { originGuard } from "./middleware/originGuard.js";

//////////////////////////////////////////////////
// ROUTES
//////////////////////////////////////////////////

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
import aiRoutes from "./routes/aiRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import devPostCodebaseRoutes from "./devMode/modules/post-codebase/routes.js";
import devViewCodebasesRoutes from "./devMode/modules/view-codebases/routes.js";
import devBattleRoutes from "./devMode/modules/battles/routes.js";

//////////////////////////////////////////////////
// SOCKET.IO
//////////////////////////////////////////////////

import { createServer } from "http";
import { Server } from "socket.io";
import { setSocketInstance } from "./controllers/battleController.js";
import jwt from "jsonwebtoken";
import User from "./models/User.js";
import Battle from "./models/battle.js";

const app = express();
const configuredProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
app.set('trust proxy', Number.isInteger(configuredProxyHops) && configuredProxyHops >= 0 ? configuredProxyHops : 1);
app.use(requestObservability());
//////////////////////////////////////////////////
// CREATE HTTP SERVER
//////////////////////////////////////////////////

const server = createServer(app);
export { server };

//////////////////////////////////////////////////
// SOCKET.IO SETUP
//////////////////////////////////////////////////

const configuredOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : [];
const localOrigins = process.env.NODE_ENV === "production"
  ? []
  : ["http://localhost:3000", "http://localhost:3001", "http://localhost:5173", "http://127.0.0.1:5173"];
const allowedOrigins = [...new Set([...localOrigins, ...configuredOrigins])];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});
//////////////////////////////////////////////////
// MAKE SOCKET AVAILABLE TO CONTROLLERS
//////////////////////////////////////////////////

setSocketInstance(io);

//////////////////////////////////////////////////
// SOCKET EVENTS
//////////////////////////////////////////////////

io.on("connection", (socket) => {

  console.log("⚡ User connected:", socket.id);

  socket.on("joinBattleRoom", async (battleId, acknowledge) => {
    const reply = typeof acknowledge === "function" ? acknowledge : () => {};
    try {
      if (!mongoose.isValidObjectId(battleId)) return reply({ success: false, message: "Invalid battle ID" });
      const battle = await Battle.findById(battleId).select("participants").lean();
      const isParticipant = battle?.participants.some((id) => String(id) === String(socket.data.userId));
      if (!isParticipant) return reply({ success: false, message: "Battle room access denied" });
      await socket.join(String(battleId));
      reply({ success: true });
    } catch {
      reply({ success: false, message: "Unable to join battle room" });
    }
  });

  socket.on("leaveBattleRoom", (battleId) => {
    socket.leave(battleId);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });

});

io.use(async (socket, next) => {
  try {
    const origin = socket.handshake.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      return next(new Error("Origin is not allowed"));
    }
    const cookies = Object.fromEntries((socket.handshake.headers.cookie || "").split(";").map((part) => part.trim().split(/=(.*)/s).slice(0, 2)).filter(([key, value]) => key && value));
    const token = socket.handshake.auth?.token || decodeURIComponent(cookies.accessToken || "");
    if (!token) return next(new Error("Authentication required"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("_id isActive passwordChangedAt").lean();
    const changedAt = user?.passwordChangedAt ? Math.floor(new Date(user.passwordChangedAt).getTime() / 1000) : 0;
    if (!user || user.isActive === false || (changedAt && decoded.iat < changedAt)) return next(new Error("Authentication required"));
    socket.data.userId = String(user._id);
    next();
  } catch {
    next(new Error("Authentication required"));
  }
});

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
    exposedHeaders: ["X-Request-Id"],
    optionsSuccessStatus: 204
  })
);

//////////////////////////////////////////////////
// SECURITY
//////////////////////////////////////////////////

app.use(
  helmet({
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false
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
  })
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
// SESSION (for Passport OAuth)
//////////////////////////////////////////////////

app.use(session(createSessionOptions()));

//////////////////////////////////////////////////
// PASSPORT
//////////////////////////////////////////////////

app.use(passport.initialize());
app.use(passport.session());

//////////////////////////////////////////////////
// ROUTES
//////////////////////////////////////////////////

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/bugs", bugRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/solutions", solutionRoutes);
app.use("/api/battles", battleRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/code", runCodeRoutes);
app.use("/api/certificate", certificateRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/dev/v1/creator", devPostCodebaseRoutes);
app.use("/api/dev/v1/view", devViewCodebasesRoutes);
app.use("/api/dev/v1/battles", devBattleRoutes);

//////////////////////////////////////////////////
// TEST ROUTE
//////////////////////////////////////////////////

app.get("/", (req, res) => {
  res.send("Backend working 🚀");
});

app.get("/health", (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? "ready" : "not_ready",
    dependencies: { database: databaseReady ? "connected" : "disconnected" },
  });
});

//////////////////////////////////////////////////
// 404 HANDLER
//////////////////////////////////////////////////

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found"
  });
});

//////////////////////////////////////////////////
// GLOBAL ERROR HANDLER
//////////////////////////////////////////////////

app.use((err, req, res, next) => {

  const statusCode = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600
    ? err.statusCode
    : 500;
  console.error("GLOBAL ERROR:", err.name || "Error", err.code || "INTERNAL_ERROR", req.path);

  res.status(statusCode).json({
    message: statusCode >= 500 ? "Internal server error" : (err.message || "Request failed")
  });

});

//////////////////////////////////////////////////
// DATABASE CONNECTION
//////////////////////////////////////////////////

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== "test") {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(async () => {
      await mongoSessionStore.ensureIndexes();
      console.log("✅ MongoDB Connected Successfully");
      server.listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 Server running on port ${PORT}`);
      });
    })
    .catch(async (err) => {
      process.exitCode = 1;
      await mongoose.disconnect().catch(() => {});
      if (redisClient.isOpen) await redisClient.quit().catch(() => {});
      console.error("❌ MongoDB connection failed:", err.message);
    });
}

if (process.env.NODE_ENV !== "test") {
  let shutdownPromise;
  const shutdown = (signal) => {
    if (shutdownPromise) return shutdownPromise;
    console.info(`Received ${signal}; closing HTTP, database, and cache connections.`);
    let shutdownTimedOut = false;
    shutdownPromise = new Promise((resolve) => {
      const forceTimer = setTimeout(async () => {
        shutdownTimedOut = true;
        console.error("Graceful shutdown timed out.");
        process.exitCode = 1;
        server.closeAllConnections?.();
        await Promise.allSettled([
          mongoose.disconnect(),
          ...(redisClient.isOpen ? [redisClient.quit()] : [])
        ]);
        resolve();
      }, 10000);
      forceTimer.unref();

      io.close(async () => {
        try {
          console.info("HTTP and Socket.IO connections closed; releasing database and cache.");
          await mongoose.disconnect();
          console.info("MongoDB connection closed.");
          if (redisClient.isOpen) await redisClient.quit();
          if (!shutdownTimedOut) process.exitCode = 0;
        } catch (error) {
          console.error("Error while closing application connections:", error.message);
          process.exitCode = 1;
        } finally {
          clearTimeout(forceTimer);
          resolve();
        }
      });
    });
    return shutdownPromise;
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}
