import { Router } from "express";
import auth from "./auth";
import { createShortUrl } from "../controllers/url";

const router = Router();

router.post("/shorten", createShortUrl);

router.use("/auth", auth);

export default router;
