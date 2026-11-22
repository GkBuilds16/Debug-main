import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { randomUUID } from "node:crypto";

let mongoServer;

export const connectDB = async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: {
      version: "7.0.14",
    },
  });

  const databaseName = `debugdsa_creator_test_${process.pid}_${randomUUID().replaceAll("-", "")}`;
  await mongoose.connect(mongoServer.getUri(databaseName));
  if (!mongoose.connection.name.startsWith("debugdsa_creator_test_")) {
    throw new Error("Integration tests must use an isolated DebugDSA test database.");
  }
};

export const closeDB = async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) await mongoServer.stop();
};

export const clearDB = async () => {
  const collections = mongoose.connection.collections;

  for (const key in collections) {
    await collections[key].deleteMany({});
  }
};
