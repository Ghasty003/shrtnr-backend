import { Router } from "express";
import {
  setup2FAHandler,
  enable2FAHandler,
  disable2FAHandler,
  verify2FAHandler,
} from "../controllers/twoFactor";
import { isUser } from "../middleware/isUser";

const router = Router();

router.get("/setup", isUser, setup2FAHandler);
router.post("/enable", isUser, enable2FAHandler);
router.post("/disable", isUser, disable2FAHandler);
router.post("/verify", verify2FAHandler);

export default router;
