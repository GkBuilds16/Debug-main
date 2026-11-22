import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const serviceAccountPath = fileURLToPath(new URL("./firebaseServiceAccount.json", import.meta.url));
const serviceAccount = existsSync(serviceAccountPath)
  ? JSON.parse(readFileSync(serviceAccountPath, "utf8"))
  : null;

const projectId = serviceAccount?.project_id || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const app = getApps()[0] || initializeApp({
  credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
  ...(projectId ? { projectId } : {}),
});

export async function verifyFirebaseIdToken(token) {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(app).verifyIdToken(token);
}
