import mongoose from "mongoose";

const connectDB = async () => {
    try {
        mongoose.connection.on("connected", () => console.log("Database Connected"));
        await mongoose.connect(process.env.MONGODB_URI);
    } catch (error) {
        // Every route depends on this connection — swallowing the error let
        // the server "boot successfully" with a dead DB, so every request
        // failed later with a confusing, unrelated-looking error instead of
        // a clear startup failure. Fail loudly instead.
        console.error("MongoDB connection failed:", error.message);
        process.exit(1);
    }
}

export default connectDB;