import geoip from "geoip-lite";
import { prisma } from "../lib/prisma";
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
  const geo = ip ? geoip.lookup(ip) : null;
  const country = geo?.country || null;

  await prisma.click.create({
    data: { url_id, ip, user_agent, referrer, country },
  });
}
