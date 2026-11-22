const stagingUsername = process.env.MONGO_STAGING_APP_USERNAME;
const stagingPassword = process.env.MONGO_STAGING_APP_PASSWORD;

if (!/^[A-Za-z0-9_]+$/.test(stagingUsername || "")) {
  throw new Error("MONGO_STAGING_APP_USERNAME must contain only letters, digits, or underscores.");
}
if (!/^[a-fA-F0-9]{64}$/.test(stagingPassword || "")) {
  throw new Error("MONGO_STAGING_APP_PASSWORD must be a 64-character hexadecimal string.");
}

db.getSiblingDB("debugdsa_staging").createUser({
  user: stagingUsername,
  pwd: stagingPassword,
  roles: [{ role: "readWrite", db: "debugdsa_staging" }],
});
