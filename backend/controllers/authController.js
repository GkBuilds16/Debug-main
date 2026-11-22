import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { verifyFirebaseIdToken } from "../config/firebase.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import sendEmail from "../utils/sendEmail.js";
import { OAuth2Client } from "google-auth-library";
////////////////////////////////////////////////////////////
// ENV VALIDATION
////////////////////////////////////////////////////////////

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET missing in .env");
}

if (!process.env.JWT_REFRESH_SECRET) {
  throw new Error("JWT_REFRESH_SECRET missing in .env");
}
const client = new OAuth2Client(
process.env.GOOGLE_CLIENT_ID
);
////////////////////////////////////////////////////////////
// TOKEN GENERATION
////////////////////////////////////////////////////////////

const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id, jti: crypto.randomUUID() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
};

////////////////////////////////////////////////////////////
// COOKIE OPTIONS
////////////////////////////////////////////////////////////

const isProd = process.env.NODE_ENV === "production";

const accessCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  maxAge: 15 * 60 * 1000
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000
};

////////////////////////////////////////////////////////////
// FIREBASE LOGIN
////////////////////////////////////////////////////////////

export const firebaseLogin = async (req, res) => {
  try {

    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Firebase token required"
      });
    }

    let identity;
    try {
      const decoded = await verifyFirebaseIdToken(token);
      identity = { email: decoded.email, name: decoded.name, verified: decoded.email_verified === true };
    } catch {
      // The login page uses Google Identity Services and sends a Google ID
      // token, while the signup page sends a Firebase ID token.
      if (!process.env.GOOGLE_CLIENT_ID) throw new Error("External identity provider is not configured");
      const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      identity = { email: payload?.email, name: payload?.name, verified: payload?.email_verified === true };
    }

    const email = identity.email;
    const name = identity.name || "User";

    if (!email || !identity.verified) {
      return res.status(400).json({
        success: false,
        message: "Invalid Firebase token"
      });
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        password: crypto.randomBytes(32).toString("base64url")
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    user.password = undefined;
    user.refreshToken = undefined;

    res
      .cookie("accessToken", accessToken, accessCookieOptions)
      .cookie("refreshToken", refreshToken, refreshCookieOptions)
      .status(200)
      .json({
        success: true,
        message: "Firebase login successful",
        user
      });

  } catch (error) {

    console.error("FIREBASE LOGIN ERROR:", error);

    res.status(401).json({
      success: false,
      message: "Firebase authentication failed"
    });

  }
};
export const googleCallback = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/login`
      );
    }

    const accessToken = generateAccessToken(req.user);
    const refreshToken = generateRefreshToken(req.user);
    req.user.refreshToken = refreshToken;
    await req.user.save({ validateBeforeSave: false });

    res
      .cookie("accessToken", accessToken, accessCookieOptions)
      .cookie("refreshToken", refreshToken, refreshCookieOptions)
      .redirect(`${process.env.FRONTEND_URL}/oauth-success`);

  } catch (error) {

    console.error(
      "GOOGLE CALLBACK ERROR:",
      error
    );

    res.redirect(
      `${process.env.FRONTEND_URL}/login`
    );
  }
};
////////////////////////////////////////////////////////////
// REGISTER
////////////////////////////////////////////////////////////

export const register = async (req, res) => {
  try {

    const { name, password } = req.body;
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const normalizedName = typeof name === "string" ? name.trim() : "";

    if (!normalizedName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required"
      });
    }

    if (normalizedName.length < 2 || normalizedName.length > 50) {
      return res.status(400).json({ success: false, message: "Name must be between 2 and 50 characters." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address." });
    }
    if (typeof password !== "string" || password.length < 6 || password.length > 128) {
      return res.status(400).json({ success: false, message: "Password must be between 6 and 128 characters." });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists"
      });
    }

    const user = await User.create({
      name: normalizedName,
      email,
      password
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    user.password = undefined;
    user.refreshToken = undefined;

    res
      .cookie("accessToken", accessToken, accessCookieOptions)
      .cookie("refreshToken", refreshToken, refreshCookieOptions)
      .status(201)
      .json({
        success: true,
        message: "User registered successfully",
        user
      });

  } catch (error) {

    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: "An account with this email already exists." });
    }
    if (error?.name === "ValidationError") {
      const message = Object.values(error.errors || {})[0]?.message;
      return res.status(400).json({ success: false, message: message || "Please check the registration details." });
    }
    console.error("REGISTER ERROR:", error?.name || "Error");

    res.status(500).json({
      success: false,
      message: "Server error during registration"
    });

  }
};

export const forgotPassword = async (req, res) => {

try {

const { email } = req.body;

const user = await User.findOne({ email });

    if (!user) return res.json({ success: true, message: "If the account exists, a reset email will be sent." });

const resetToken = crypto
.randomBytes(32)
.toString("hex");

const hashedToken = crypto
.createHash("sha256")
.update(resetToken)
.digest("hex");

user.passwordResetToken = hashedToken;

user.passwordResetExpires =
Date.now() + 15 * 60 * 1000;

await user.save();

const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
const message = `
<h2>Password Reset</h2>

<p>Click below:</p>

<a href="${resetUrl}">
${resetUrl}
</a>
`;

await sendEmail({

email:user.email,
subject:"Reset Password",
message

});

res.json({

success:true,
      message:"If the account exists, a reset email will be sent."

});

} catch (error) {

console.log(error);

res.status(500).json({

success:false,
message:"Server Error"

});

}

};


export const resetPassword = async (req, res) => {

try {

    if (typeof req.body.password !== "string" || req.body.password.length < 6 || req.body.password.length > 128) {
      return res.status(400).json({ success: false, message: "Password must be between 6 and 128 characters." });
    }

const hashedToken = crypto
.createHash("sha256")
.update(req.params.token)
.digest("hex");

const user = await User.findOne({

passwordResetToken: hashedToken,

passwordResetExpires: {
$gt: Date.now()
}

}).select("+password");

if (!user) {

return res.status(400).json({

success:false,
message:"Token expired"

});

}

user.password = req.body.password;

user.passwordResetToken = undefined;

user.passwordResetExpires = undefined;
user.refreshToken = null;

await user.save();

res.json({

success:true,
message:"Password reset successful"

});

} catch (error) {

console.log(error);

res.status(500).json({

success:false,
message:"Server Error"

});

}

};

////////////////////////////////////////////////////////////
// LOGIN
////////////////////////////////////////////////////////////

export const login = async (req, res) => {
  try {

    const { password } = req.body;
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";

    if (!email || typeof password !== "string" || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const user = await User.findOne({ email })
      .select("+password +refreshToken +loginAttempts +lockUntil");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    if (user.isLocked()) {
      return res.status(423).json({ success: false, message: "Account temporarily locked. Try again later." });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      await user.incrementLoginAttempts();
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    if (user.loginAttempts || user.lockUntil) {
      user.loginAttempts = 0;
      user.lockUntil = undefined;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    user.password = undefined;
    user.refreshToken = undefined;

    res
      .cookie("accessToken", accessToken, accessCookieOptions)
      .cookie("refreshToken", refreshToken, refreshCookieOptions)
      .status(200)
      .json({
        success: true,
        message: "Login successful",
        user
      });

  } catch (error) {

    console.error("LOGIN ERROR:", error?.name || "Error");

    res.status(500).json({
      success: false,
      message: "Server error during login"
    });

  }
};

////////////////////////////////////////////////////////////
// REFRESH TOKEN
////////////////////////////////////////////////////////////

export const refreshAccessToken = async (req, res) => {
  try {

    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token required"
      });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET
    );

    const user = await User.findOne({ _id: decoded.id, refreshToken })
      .select("+refreshToken");

    if (!user) {
      return res.status(403).json({
        success: false,
        message: "Invalid refresh token"
      });
    }

    const rotatedRefreshToken = generateRefreshToken(user);
    const updated = await User.findOneAndUpdate(
      { _id: user._id, refreshToken },
      { $set: { refreshToken: rotatedRefreshToken } },
      { returnDocument: "after" }
    );
    if (!updated) {
      return res.status(403).json({ success: false, message: "Refresh token has already been used" });
    }
    const newAccessToken = generateAccessToken(user);

    res
      .cookie("accessToken", newAccessToken, accessCookieOptions)
      .cookie("refreshToken", rotatedRefreshToken, refreshCookieOptions)
      .status(200)
      .json({
        success: true,
        message: "Access token refreshed"
      });

  } catch (error) {

    console.error("REFRESH ERROR:", error);

    res.status(403).json({
      success: false,
      message: "Refresh token expired or invalid"
    });

  }
};

////////////////////////////////////////////////////////////
// LOGOUT
////////////////////////////////////////////////////////////

export const logout = async (req, res) => {
  try {

    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {

      try {

        const decoded = jwt.verify(
          refreshToken,
          process.env.JWT_REFRESH_SECRET
        );

        await User.findByIdAndUpdate(decoded.id, {
          refreshToken: null
        });

      } catch {
        console.log("Refresh token already expired");
      }

    }

    res
      .clearCookie("accessToken", accessCookieOptions)
      .clearCookie("refreshToken", refreshCookieOptions)
      .status(200)
      .json({
        success: true,
        message: "Logged out successfully"
      });

  } catch (error) {

    console.error("LOGOUT ERROR:", error);

    res.status(200).json({
      success: true,
      message: "Logged out"
    });

  }
};
