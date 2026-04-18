import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/token";

export function optionalUser(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return next(); // no token — continue as anonymous
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    (req as any).user = payload;
  } catch {
    // token present but invalid/expired — still continue, just don't attach user
    // we don't block here because the endpoint is intentionally public
  }

  next();
}
