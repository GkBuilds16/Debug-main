module.exports = {
  testEnvironment: "node",
  transform: {},
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  testTimeout: 30000,
  setupFiles: ["<rootDir>/tests/setup/loadEnv.cjs"],
};
