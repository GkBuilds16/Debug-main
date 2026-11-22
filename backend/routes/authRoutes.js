import express from "express";
import passport from "passport";
import { googleOAuthEnabled } from "../config/passport.js";
import { registerLimiter, loginLimiter } from "../middleware/authRateLimiters.js";

import {
  register,
  login,
  refreshAccessToken,
  logout,
  forgotPassword,
  resetPassword,
  googleCallback,
  firebaseLogin
} from "../controllers/authController.js";
const router = express.Router();
const requireGoogleOAuth = (_req, res, next) => googleOAuthEnabled
  ? next()
  : res.status(503).json({ success: false, message: "Google sign-in is not configured." });

//////////////////////////////////////////////////
// GOOGLE AUTHENTICATION
//////////////////////////////////////////////////

router.get(
  "/google",
  requireGoogleOAuth,
  passport.authenticate("google", { scope: ["profile", "email"] })
);

//////////////////////////////////////////////////
// GOOGLE CALLBACK
//////////////////////////////////////////////////

router.get(
  "/google/callback",
  requireGoogleOAuth,
  passport.authenticate("google", { session: false }),
  googleCallback
);

//////////////////////////////////////////////////
// FIREBASE GOOGLE LOGIN
//////////////////////////////////////////////////

router.post(
  "/firebase-login",
  firebaseLogin
);

//////////////////////////////////////////////////
// PASSWORD RESET
//////////////////////////////////////////////////

router.post(
  "/forgot-password",
  forgotPassword
);

router.put(
  "/reset-password/:token",
  resetPassword
);

//////////////////////////////////////////////////
// NORMAL AUTH
//////////////////////////////////////////////////

router.post(
  "/register",
  registerLimiter,
  register
);

router.post(
  "/login",
  loginLimiter,
  login
);

router.post(
  "/refresh",
  refreshAccessToken
);

router.post(
  "/logout",
  logout
);

export default router;
