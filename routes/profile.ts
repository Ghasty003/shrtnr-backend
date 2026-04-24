import { Router } from "express";
import {
  changePasswordHandler,
  updateUsernameHandler,
} from "../controllers/profile";
import { isUser } from "../middleware/isUser";

const router = Router();

router.patch("/username", isUser, updateUsernameHandler);
router.patch("/password", isUser, changePasswordHandler);

export default router;
