import { Router } from "express";
import * as auth from "../controllers/auth";
import { isUser } from "../middleware/isUser";

const router = Router();

router.post("/register", auth.register);
router.post("/verify-otp", auth.verifyOtp);
router.post("/login", auth.loginHandler);
router.post("/refresh", auth.refresh);
router.post("/logout", auth.logout);
router.post("/logout-all", isUser, auth.logoutAllDevices);

export default router;
