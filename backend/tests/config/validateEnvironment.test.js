import { expect, test } from "@jest/globals";
import { validateRuntimeConfig } from "../../config/validateEnvironment.js";

const validProductionConfig = () => ({
  NODE_ENV: "production",
  MONGO_URI: "mongodb://debugdsa_app:app-pass@mongo.example.net/debugdsa?authSource=debugdsa",
  JWT_SECRET: "access-secret-with-more-than-thirty-two-characters",
  JWT_REFRESH_SECRET: "refresh-secret-with-more-than-thirty-two-characters",
  SESSION_SECRET: "session-secret-with-more-than-thirty-two-characters",
  FRONTEND_URL: "https://debugdsa.example.com",
  ALLOWED_ORIGINS: "https://debugdsa.example.com",
  TRUST_PROXY_HOPS: "2",
  AI_PROVIDER: "groq",
  GROQ_API_KEY: "groq-test-key",
  STORAGE_PROVIDER: "local",
  JUDGE0_API_URL: "https://judge0.internal.example.net",
});

test("accepts a fully configured production environment and reports enabled integrations", () => {
  expect(validateRuntimeConfig(validProductionConfig())).toMatchObject({
    mode: "production",
    googleOAuthEnabled: false,
    redisConfigured: false,
    storageProvider: "local",
    aiProvider: "groq",
  });
});

test("rejects missing or development-placeholder production secrets and defaults", () => {
  const env = validProductionConfig();
  env.JWT_SECRET = "your_jwt_secret";
  env.TRUST_PROXY_HOPS = "";
  env.MONGO_URI = "mongodb://localhost:27017/admin";
  env.JUDGE0_API_URL = "https://ce.judge0.com";
  expect(() => validateRuntimeConfig(env)).toThrow(/MONGO_URI.*JWT_SECRET.*TRUST_PROXY_HOPS.*JUDGE0_API_URL/s);
});

test("rejects partial OAuth, Redis, SMTP, and R2 settings", () => {
  const env = {
    ...validProductionConfig(),
    GOOGLE_CLIENT_ID: "client-id",
    REDIS_URL: "http://redis.example.net",
    EMAIL_USER: "mail@example.com",
    STORAGE_PROVIDER: "r2",
    R2_ACCOUNT_ID: "account",
  };
  expect(() => validateRuntimeConfig(env)).toThrow(/Google OAuth requires.*REDIS_URL.*R2 storage.*EMAIL_USER/s);
});

test("requires reachable non-loopback Ollama when selected", () => {
  const env = { ...validProductionConfig(), AI_PROVIDER: "ollama", OLLAMA_URL: "http://localhost:11434", OLLAMA_MODEL: "test" };
  expect(() => validateRuntimeConfig(env)).toThrow(/non-loopback OLLAMA_URL/);
});

test("development and test modes do not require production secrets", () => {
  expect(validateRuntimeConfig({ NODE_ENV: "development" }).mode).toBe("development");
  expect(validateRuntimeConfig({ NODE_ENV: "test" }).mode).toBe("test");
});
