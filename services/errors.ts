import type { Response } from "express";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function handleError(res: Response, error: unknown) {
  if (error instanceof ConflictError)
    return res.status(409).json({ success: false, message: error.message });
  if (error instanceof ValidationError)
    return res.status(400).json({ success: false, message: error.message });
  if (error instanceof AuthError)
    return res.status(401).json({ success: false, message: error.message });

  console.error("[Auth]", error);
  return res
    .status(500)
    .json({ success: false, message: "Internal server error." });
}
