import { Router } from "express";
import { isUser } from "../middleware/isUser";
import {
  getAnalyticsStats,
  getAnalyticsClicks,
  getAnalyticsTopLinks,
  getAnalyticsCountries,
  getAnalyticsReferrers,
  getAnalyticsDevices,
} from "../controllers/analytics";

const router = Router();

router.get("/stats", isUser, getAnalyticsStats);
router.get("/clicks", isUser, getAnalyticsClicks);
router.get("/top-links", isUser, getAnalyticsTopLinks);
router.get("/countries", isUser, getAnalyticsCountries);
router.get("/referrers", isUser, getAnalyticsReferrers);
router.get("/devices", isUser, getAnalyticsDevices);

export default router;
