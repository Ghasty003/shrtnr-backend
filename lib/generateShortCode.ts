import crypto from "crypto";

export default function () {
  const bytes = crypto.randomBytes(6);
  return toBase62(bytes);
}

function toBase62(buffer: Buffer) {
  const BASE62 =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  let num = BigInt("0x" + buffer.toString("hex"));

  if (num === 0n) return "0";

  let result = "";

  while (num > 0n) {
    const rem = Number(num % 62n);
    result = BASE62[rem] + result;
    num = num / 62n;
  }

  return result;
}
