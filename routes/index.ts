import { Router } from "express";
import auth from "./auth";
import url from "./url";
import analytics from "./analytics";
import profile from "./profile";
import twoFactor from "./twoFactor";

const router = Router();

router.use("/url", url);
router.use("/analytics", analytics);
router.use("/auth", auth);
router.use("/profile", profile);
router.use("/2fa", twoFactor);

export default router;
