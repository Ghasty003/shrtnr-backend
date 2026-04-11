import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as auth from "../controllers/auth";
import { isUser } from "../middleware/isUser";

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5, // very strict
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const router = Router();

router.post("/register", registerLimiter, auth.register);
router.post("/verify-otp", otpLimiter, auth.verifyOtp);
router.post("/login", loginLimiter, auth.loginHandler);
router.post("/refresh", refreshLimiter, auth.refresh);
router.post("/logout", generalLimiter, auth.logout);
router.post("/logout-all", isUser, generalLimiter, auth.logoutAllDevices);

export default router;
