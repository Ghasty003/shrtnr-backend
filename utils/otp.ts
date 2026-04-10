import bcrypt from "bcrypt";
import crypto from "crypto";

export function generateOtp(): string {
  // crypto-random to avoid Math.random() bias
  const buf = crypto.randomBytes(3);
  const num = buf.readUIntBE(0, 3) % 1_000_000;
  return num.toString().padStart(6, "0");
}

export async function hashOtp(otp: string): Promise<string> {
  // bcrypt here because OTP entropy is low (6 digits = 1M possibilities)
  return bcrypt.hash(otp, 10);
}

export async function verifyOtp(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}
