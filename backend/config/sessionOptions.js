import { mongoSessionStore } from "./mongoSessionStore.js";

export const OAUTH_SESSION_TTL_MS = 15 * 60 * 1000;

export function createSessionOptions(env = process.env) {
  return {
    name: "debugdsa.sid",
    secret: env.SESSION_SECRET,
    store: mongoSessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: OAUTH_SESSION_TTL_MS,
    },
  };
}
