import geoip from "geoip-lite";
import { prisma } from "../lib/prisma";
import { UAParser } from "ua-parser-js";

function normalizeIp(ip: string | null): string | null {
  if (!ip) return null;
  // Strip IPv6-mapped IPv4 prefix (::ffff:1.2.3.4 → 1.2.3.4)
  // This is common on dual-stack servers and geoip-lite won't resolve without it
  return ip.replace(/^::ffff:/, "");
}

function getDeviceType(userAgent: string | null): string {
  if (!userAgent) return "Desktop";
  const type = new UAParser(userAgent).getDevice().type;
  if (type === "mobile") return "Mobile";
  if (type === "tablet") return "Tablet";
  return "Desktop"; // undefined device type = desktop
}

export default async function trackClick({
  url_id,
  ip,
  user_agent,
  referrer,
}: {
  url_id: number;
  ip: string | null;
  user_agent: string | null;
  referrer: string | null;
}) {
  const cleanIp = normalizeIp(ip);
  const geo = ip ? geoip.lookup(<string>cleanIp) : null;
  const country = geo?.country || null;
  const device = getDeviceType(user_agent);

  await prisma.click.create({
    data: { url_id, ip: cleanIp, user_agent, referrer, country, device },
  });
}
