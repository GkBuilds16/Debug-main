import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import crypto from "node:crypto";
import User from "../models/User.js";

export const googleOAuthEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_CALLBACK_URL &&
  process.env.SESSION_SECRET
);

if (googleOAuthEnabled) {

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
        state: true
      },
      async (accessToken, refreshToken, profile, done) => {
        try {

          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error("Google account did not provide an email address."));
          let user = await User.findOne({ email });

          if (!user) {
            user = await User.create({
              name: profile.displayName,
              email,
              password: crypto.randomBytes(32).toString("base64url")
            });
          }

          return done(null, user);

        } catch (error) {
          return done(error, null);
        }
      }
    )
  );

}

export default passport;
