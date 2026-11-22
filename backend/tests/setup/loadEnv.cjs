const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(__dirname, "../../.env.test"),
});

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "debugdsa-test-only-jwt-secret";
process.env.SESSION_SECRET ||= "debugdsa-test-only-session-secret";
process.env.CODEBASE_STORAGE_DIR ||= path.join(require("os").tmpdir(), `debugdsa-codebase-test-storage-${process.pid}`);
