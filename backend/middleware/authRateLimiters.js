import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const AUTH_WINDOW_MS = 15 * 60 * 1000;

export function authRateLimitKeyGenerator(req) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const normalizedIp = ip.toLowerCase().replace(/^::ffff:/, "");
  if (["::1", "127.0.0.1"].includes(normalizedIp)) return "local-loopback";
  return ipKeyGenerator(ip);
}

function createLimiter({ limit, action }) {
  return rateLimit({
    windowMs: AUTH_WINDOW_MS,
    limit,
    keyGenerator: authRateLimitKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === "OPTIONS",
    handler: (req, res) => {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(((req.rateLimit?.resetTime?.getTime?.() ?? Date.now() + AUTH_WINDOW_MS) - Date.now()) / 1000)
      );
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        message: `Too many ${action} attempts. Please try again in about ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
        retryAfterSeconds
      });
    }
  });
}

export function createAuthRateLimiters() {
  return {
    registerLimiter: createLimiter({ limit: 5, action: "registration" }),
    loginLimiter: createLimiter({ limit: 10, action: "login" })
  };
}

const authRateLimiters = createAuthRateLimiters();
export const registerLimiter = authRateLimiters.registerLimiter;
export const loginLimiter = authRateLimiters.loginLimiter;
