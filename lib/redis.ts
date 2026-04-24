import { createClient } from "redis";

const redisClient = createClient({
  username: "default",
  url: process.env.REDIS_URL || "127.0.0.1",
  password: process.env.REDIS_PASSWORD || "",
});

redisClient.on("error", (err) => console.error("Redis error:", err));

export const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
};

export default redisClient;
