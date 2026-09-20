import mongoose from "mongoose";

// One shared MongoDB cluster (the connection opened once in config/db.js).
// Every tenant gets its own database on that same cluster, selected here via
// useDb() — this reuses the parent connection's MongoClient/pool rather than
// opening a new one, which is what "one shared cluster" actually requires.
// This file is the ONLY place useDb() is called anywhere in the codebase —
// nothing else should call it directly, or it bypasses the model registry's
// per-connection caching (mongoose.connection.useDb() with useCache:true
// still returns a distinct, empty-models Connection object per db name).

const PLATFORM_DB_NAME = process.env.PLATFORM_DB_NAME || "UniAssistPlatform";

export const getTenantConnection = (dbName) => {
  if (!dbName) throw new Error("getTenantConnection: dbName is required");
  return mongoose.connection.useDb(dbName, { useCache: true });
};

export const getPlatformConnection = () => {
  return mongoose.connection.useDb(PLATFORM_DB_NAME, { useCache: true });
};
