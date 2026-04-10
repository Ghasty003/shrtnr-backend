import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/token";

export function isUser(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization header missing." });
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    (req as any).user = payload;
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ message: "Access token expired.", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ message: "Invalid token." });
  }
}
