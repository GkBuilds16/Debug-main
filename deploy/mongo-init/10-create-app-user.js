const applicationUser = process.env.MONGO_APP_USERNAME;
const applicationPassword = process.env.MONGO_APP_PASSWORD;

if (!/^[A-Za-z0-9_]+$/.test(applicationUser || "")) {
  throw new Error("MONGO_APP_USERNAME must contain only letters, digits, or underscores.");
}
if (!/^[a-fA-F0-9]{64}$/.test(applicationPassword || "")) {
  throw new Error("MONGO_APP_PASSWORD must be a 64-character hexadecimal string.");
}

db.getSiblingDB("debugdsa").createUser({
  user: applicationUser,
  pwd: applicationPassword,
  roles: [{ role: "readWrite", db: "debugdsa" }],
});
