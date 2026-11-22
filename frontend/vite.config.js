import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const firebaseKeys = [
    "REACT_APP_FIREBASE_API_KEY",
    "REACT_APP_FIREBASE_AUTH_DOMAIN",
    "REACT_APP_FIREBASE_PROJECT_ID",
    "REACT_APP_FIREBASE_STORAGE_BUCKET",
    "REACT_APP_FIREBASE_MESSAGING_SENDER_ID",
    "REACT_APP_FIREBASE_APP_ID",
  ];
  const configuredFirebaseKeys = firebaseKeys.filter(key => env[key]?.trim());
  if (configuredFirebaseKeys.length && configuredFirebaseKeys.length !== firebaseKeys.length) {
    throw new Error(`Firebase browser configuration must set all required values together: ${firebaseKeys.join(", ")}`);
  }
  return {
    plugins: [react({ include: /\.[jt]sx?$/ })],
    esbuild: { loader: "jsx", include: /\.[jt]sx?$/, exclude: /node_modules/ },
    optimizeDeps: { esbuildOptions: { loader: { ".js": "jsx" } } },
    build: { outDir: "build" },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/setupTests.js"],
      testTimeout: 10000,
    },
    define: {
      "process.env.REACT_APP_API": JSON.stringify(env.REACT_APP_API || ""),
      "process.env.REACT_APP_FIREBASE_API_KEY": JSON.stringify(env.REACT_APP_FIREBASE_API_KEY || ""),
      "process.env.REACT_APP_FIREBASE_AUTH_DOMAIN": JSON.stringify(env.REACT_APP_FIREBASE_AUTH_DOMAIN || ""),
      "process.env.REACT_APP_FIREBASE_PROJECT_ID": JSON.stringify(env.REACT_APP_FIREBASE_PROJECT_ID || ""),
      "process.env.REACT_APP_FIREBASE_STORAGE_BUCKET": JSON.stringify(env.REACT_APP_FIREBASE_STORAGE_BUCKET || ""),
      "process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID": JSON.stringify(env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || ""),
      "process.env.REACT_APP_FIREBASE_APP_ID": JSON.stringify(env.REACT_APP_FIREBASE_APP_ID || ""),
      "process.env.REACT_APP_FIREBASE_MEASUREMENT_ID": JSON.stringify(env.REACT_APP_FIREBASE_MEASUREMENT_ID || ""),
    },
  };
});
