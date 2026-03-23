const mongoose = require("mongoose");

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  const uri = process.env.DB_STRING;
  if (!uri) {
    console.error("DB_STRING environment variable is not set!");
    return null;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, {
        // Required for some serverless environments
        serverSelectionTimeoutMS: 10000,
      })
      .then((mongoose) => {
        console.log(`MongoDB Connected: ${mongoose.connection.host}`);
        return mongoose;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    console.error("MongoDB connection error:", err.message);
  }

  return cached.conn;
};

module.exports = connectDB;
