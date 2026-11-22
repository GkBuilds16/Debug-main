import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  const token = req.cookies?.accessToken || (
    req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice("Bearer ".length)
      : null
  );

  if (!token) {
    return res.status(401).json({ message: "Not authorized. No token provided." });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(error.name)) {
      return res.status(401).json({ message: "Invalid or expired token." });
    }
    return next(error);
  }

  if (!decoded || !mongoose.isValidObjectId(decoded.id)) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }

  let user;
  try {
    user = await User.findById(decoded.id).select("-password -refreshToken +isActive");
  } catch (error) {
    return next(error);
  }

  if (!user) {
    return res.status(401).json({ message: "User no longer exists." });
  }

  if (user.isActive === false || user.changedPasswordAfter(decoded.iat)) {
    return res.status(401).json({ message: "Session is no longer valid. Please sign in again." });
  }

  req.user = user;
  return next();
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission to perform this action."
      });
    }
    return next();
  };
};