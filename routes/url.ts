import { Router } from "express";
import {
  createShortUrl,
  getActivity,
  getLinkClicksHandler,
  getLinkCountriesHandler,
  getLinkDetailHandler,
  getLinkDevicesHandler,
  getLinkReferrersHandler,
  getLinks,
  getLinksPaginated,
  getStats,
} from "../controllers/url";
import { isUser } from "../middleware/isUser";
import { optionalUser } from "../middleware/optionUser";

const router = Router();

router.post("/shorten", optionalUser, createShortUrl);

// Dashboard
router.get("/links", isUser, getLinks);
router.get("/stats", isUser, getStats);
router.get("/activity", isUser, getActivity);

// Links page
router.get("/links/all", isUser, getLinksPaginated);

// Link detail
router.get("/links/:slug", isUser, getLinkDetailHandler);
router.get("/links/:slug/clicks", isUser, getLinkClicksHandler);
router.get("/links/:slug/countries", isUser, getLinkCountriesHandler);
router.get("/links/:slug/referrers", isUser, getLinkReferrersHandler);
router.get("/links/:slug/devices", isUser, getLinkDevicesHandler);

export default router;
