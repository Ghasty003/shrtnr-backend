import { Router } from "express";
import auth from "./auth";
import url from "./url";
import analytics from "./analytics";

const router = Router();

router.use("/url", url);
router.use("/analytics", analytics);
router.use("/auth", auth);

export default router;
