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
    origin: ["http://localhost:5173", "https://shrtnr-six.vercel.app"],
  }),
);
app.use(cookieParser());
app.set("trust proxy", 1);
app.use(express.json({ limit: "50mb" }));

app.use("/api/v1", routes);
app.get("/:code", redirectUrl);

// app.use("*", (_, res) => {
//   res.status(404).json("App is working but route not found");
// });

async function bootstrap() {
  await connectRedis();

  const port = process.env.PORT || 8000;
  app.listen(port, () => {
    console.log(`server started at http://localhost:${port}`);
  });
}

bootstrap();
