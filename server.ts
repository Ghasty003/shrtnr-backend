import express from "express";
import cors from "cors";

import { createShortUrl, redirectUrl } from "./controllers/url";
import { connectRedis } from "./lib/redis";

const app = express();

app.use(cors());
app.set("trust proxy", 1);
app.use(express.json({ limit: "50mb" }));

app.post("/api/v1/shorten", createShortUrl);
app.get("/:code", redirectUrl);

// app.use("*", (_, res) => {
//   res.status(404).json("App is working but route not found");
// });

async function bootstrap() {
  await connectRedis();

  app.listen(8000, () => {
    console.log("server started at http://localhost:8000");
  });
}

bootstrap();
