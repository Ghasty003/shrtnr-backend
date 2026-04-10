export const ANALYTICS_JOB_NAMES = {
  SAVE_CLICK: "save-click",
} as const;

export interface SaveClickJobData {
  url_id: number;
  ip: string | null;
  user_agent: string | null;
  referrer: string | null;
}
