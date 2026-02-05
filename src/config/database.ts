import "dotenv/config";
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connecté à MongoDB");
  } catch (error) {
    console.error("❌ Erreur de connexion MongoDB:", error);
    process.exit(1);
  }
}

mongoose.connection.on("disconnected", () => {
  console.log("⚠️ Déconnecté de MongoDB");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ Erreur MongoDB:", err);
});
