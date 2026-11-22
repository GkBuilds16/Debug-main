const looksPlaceholder = value => /^(your_|replace_|change_me|placeholder|example$)/i.test(String(value || "").trim());
const hasValue = value => typeof value === "string" && value.trim().length > 0;

function parseUrl(value) {
  try { return new URL(value); } catch { return null; }
}

function isLoopback(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" ||
    host === "0.0.0.0" || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function isHttpsOrigin(value) {
  const parsed = parseUrl(value);
  return parsed && parsed.protocol === "https:" && !parsed.username && !parsed.password &&
    !parsed.search && !parsed.hash && (parsed.pathname === "/" || parsed.pathname === "") &&
    value.trim().replace(/\/$/, "") === parsed.origin;
}

export function validateRuntimeConfig(env = process.env) {
  if (env.NODE_ENV !== "production") {
    return { mode: env.NODE_ENV || "development", googleOAuthEnabled: false };
  }

  const errors = [];
  const requireStrongSecret = name => {
    const value = env[name];
    if (!hasValue(value) || value.trim().length < 32 || looksPlaceholder(value)) {
      errors.push(`${name} must be a unique secret with at least 32 characters.`);
    }
  };

  const mongoUri = parseUrl(env.MONGO_URI || "");
  if (!mongoUri || !["mongodb:", "mongodb+srv:"].includes(mongoUri.protocol) ||
      !mongoUri.username || !mongoUri.password || !mongoUri.pathname.slice(1) ||
      ["admin", "local", "config"].includes(mongoUri.pathname.slice(1).toLowerCase())) {
    errors.push("MONGO_URI must use MongoDB authentication and target an application database.");
  }

  for (const name of ["JWT_SECRET", "JWT_REFRESH_SECRET", "SESSION_SECRET"]) requireStrongSecret(name);
  if (new Set([env.JWT_SECRET, env.JWT_REFRESH_SECRET, env.SESSION_SECRET]).size !== 3) {
    errors.push("JWT_SECRET, JWT_REFRESH_SECRET, and SESSION_SECRET must be different values.");
  }

  if (!isHttpsOrigin(env.FRONTEND_URL || "")) errors.push("FRONTEND_URL must be an HTTPS origin without a path.");
  const origins = String(env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  if (!origins.length || origins.some(origin => !isHttpsOrigin(origin))) {
    errors.push("ALLOWED_ORIGINS must be a comma-separated list of HTTPS origins without paths or wildcards.");
  } else if (!origins.includes(String(env.FRONTEND_URL || "").replace(/\/$/, ""))) {
    errors.push("ALLOWED_ORIGINS must include FRONTEND_URL.");
  }

  const proxyHops = Number(env.TRUST_PROXY_HOPS);
  if (!hasValue(env.TRUST_PROXY_HOPS) || !Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5) {
    errors.push("TRUST_PROXY_HOPS must be explicitly set to an integer from 0 to 5.");
  }
  if (env.PORT !== undefined && (!/^\d+$/.test(env.PORT) || Number(env.PORT) < 1 || Number(env.PORT) > 65535)) {
    errors.push("PORT must be an integer from 1 to 65535.");
  }

  const googleFields = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALLBACK_URL"];
  const configuredGoogleFields = googleFields.filter(name => hasValue(env[name]));
  if (configuredGoogleFields.length > 0 && configuredGoogleFields.length !== googleFields.length) {
    errors.push("Google OAuth requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL together.");
  }
  if (configuredGoogleFields.length === googleFields.length) {
    const callback = parseUrl(env.GOOGLE_CALLBACK_URL);
    if (!callback || callback.protocol !== "https:" || callback.pathname !== "/api/auth/google/callback" ||
        callback.username || callback.password || callback.search || callback.hash ||
        looksPlaceholder(env.GOOGLE_CLIENT_ID) || looksPlaceholder(env.GOOGLE_CLIENT_SECRET)) {
      errors.push("Google OAuth credentials must be real and its HTTPS callback must end in /api/auth/google/callback.");
    }
  }

  const provider = String(env.AI_PROVIDER || "").trim().toLowerCase();
  if (!["groq", "ollama"].includes(provider)) errors.push("AI_PROVIDER must explicitly be groq or ollama in production.");
  if (provider === "groq" && (!hasValue(env.GROQ_API_KEY) || looksPlaceholder(env.GROQ_API_KEY))) {
    errors.push("GROQ_API_KEY is required when AI_PROVIDER=groq.");
  }
  if (provider === "ollama") {
    const ollamaUrl = parseUrl(env.OLLAMA_URL || "");
    if (!ollamaUrl || !["http:", "https:"].includes(ollamaUrl.protocol) || isLoopback(ollamaUrl.hostname) ||
        ollamaUrl.username || ollamaUrl.password || ollamaUrl.search || ollamaUrl.hash ||
        !["", "/"].includes(ollamaUrl.pathname) || !hasValue(env.OLLAMA_MODEL)) {
      errors.push("Production Ollama requires a reachable non-loopback OLLAMA_URL and OLLAMA_MODEL.");
    }
  }

  if (hasValue(env.REDIS_URL)) {
    const redisUrl = parseUrl(env.REDIS_URL);
    if (!redisUrl || !["redis:", "rediss:"].includes(redisUrl.protocol) || !redisUrl.hostname) {
      errors.push("REDIS_URL must be a valid redis:// or rediss:// URL.");
    }
  }

  const storageProvider = String(env.STORAGE_PROVIDER || "").trim().toLowerCase();
  if (!["local", "r2"].includes(storageProvider)) errors.push("STORAGE_PROVIDER must be local or r2 in production.");
  if (storageProvider === "r2" && ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"].some(name => !hasValue(env[name]))) {
    errors.push("R2 storage requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.");
  }

  if (Boolean(hasValue(env.EMAIL_USER)) !== Boolean(hasValue(env.EMAIL_PASS))) {
    errors.push("EMAIL_USER and EMAIL_PASS must be configured together.");
  }
  if (hasValue(env.EMAIL_USER) && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.EMAIL_USER) || looksPlaceholder(env.EMAIL_USER) || looksPlaceholder(env.EMAIL_PASS))) {
    errors.push("EMAIL_USER and EMAIL_PASS must contain non-placeholder SMTP credentials.");
  }

  const judge0Url = parseUrl(env.JUDGE0_API_URL || "");
  if (!judge0Url || judge0Url.protocol !== "https:" || !judge0Url.hostname ||
      judge0Url.username || judge0Url.password || judge0Url.search || judge0Url.hash ||
      judge0Url.hostname.toLowerCase() === "ce.judge0.com") {
    errors.push("Production requires an explicit HTTPS JUDGE0_API_URL for a controlled deployment, not the shared public CE endpoint.");
  }

  if (Boolean(hasValue(env.ADMIN_EMAIL)) !== Boolean(hasValue(env.ADMIN_PASSWORD))) {
    errors.push("ADMIN_EMAIL and ADMIN_PASSWORD must be configured together.");
  }

  if (errors.length) throw new Error(`Invalid production configuration:\n- ${errors.join("\n- ")}`);
  return {
    mode: "production",
    googleOAuthEnabled: configuredGoogleFields.length === googleFields.length,
    redisConfigured: hasValue(env.REDIS_URL),
    storageProvider,
    aiProvider: provider,
  };
}
