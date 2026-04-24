import express from "express";
import cors from "cors";

import { redirectUrl } from "./controllers/url";
import { connectRedis } from "./lib/redis";
import routes from "./routes";
import cookieParser from "cookie-parser";

const app = express();

app.use(
  cors({
    credentials: true,
    exposedHeaders: ["retry-after", "ratelimit", "ratelimit-policy"],
    origin: ["http://localhost:5173"],
  }),
);
app.use(cookieParser());
app.set("trust proxy", 1);
app.use(express.json({ limit: "50mb" }));

app.get("/:code", redirectUrl);
app.use("/api/v1", routes);

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
