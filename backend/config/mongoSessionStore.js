import session from "express-session";
import mongoose from "mongoose";

const DEFAULT_SESSION_TTL_MS = 15 * 60 * 1000;

class MongoSessionStore extends session.Store {
  constructor({ collectionName = "oauth_sessions", ttlMs = DEFAULT_SESSION_TTL_MS } = {}) {
    super();
    this.collectionName = collectionName;
    this.ttlMs = ttlMs;
    this.indexedDatabase = null;
    this.indexPromise = null;
  }

  async ensureIndexes() {
    const database = mongoose.connection.db;
    if (!database) throw new Error("MongoDB must be connected before using the session store.");
    if (this.indexedDatabase !== database) {
      this.indexedDatabase = database;
      this.indexPromise = database.collection(this.collectionName).createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: "oauth_session_ttl" }
      );
    }
    await this.indexPromise;
  }

  sessionExpiry(value) {
    const cookieExpiry = value?.cookie?.expires ? new Date(value.cookie.expires) : null;
    const expiry = cookieExpiry && Number.isFinite(cookieExpiry.getTime())
      ? cookieExpiry
      : new Date(Date.now() + this.ttlMs);
    return expiry;
  }

  get(sid, callback) {
    this.#run(callback, async () => {
      await this.ensureIndexes();
      const record = await mongoose.connection.db.collection(this.collectionName).findOne({ _id: sid });
      if (!record || record.expiresAt <= new Date()) {
        if (record) await mongoose.connection.db.collection(this.collectionName).deleteOne({ _id: sid });
        return null;
      }
      return record.session;
    });
  }

  set(sid, value, callback) {
    this.#run(callback, async () => {
      await this.ensureIndexes();
      await mongoose.connection.db.collection(this.collectionName).updateOne(
        { _id: sid },
        { $set: { session: value, expiresAt: this.sessionExpiry(value) } },
        { upsert: true }
      );
    });
  }

  touch(sid, value, callback) {
    this.#run(callback, async () => {
      await this.ensureIndexes();
      await mongoose.connection.db.collection(this.collectionName).updateOne(
        { _id: sid },
        { $set: { expiresAt: this.sessionExpiry(value) } }
      );
    });
  }

  destroy(sid, callback) {
    this.#run(callback, async () => {
      await this.ensureIndexes();
      await mongoose.connection.db.collection(this.collectionName).deleteOne({ _id: sid });
    });
  }

  #run(callback, operation) {
    Promise.resolve().then(operation).then(
      result => callback?.(null, result),
      error => callback?.(error)
    );
  }
}

export const mongoSessionStore = new MongoSessionStore();
export { DEFAULT_SESSION_TTL_MS, MongoSessionStore };
