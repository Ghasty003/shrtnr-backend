export const ANALYTICS_JOB_NAMES = {
  SAVE_CLICK: "save-click",
  DISABLE_LINK: "disable-link",
} as const;

export interface SaveClickJobData {
  url_id: number;
  ip: string | null;
  user_agent: string | null;
  referrer: string | null;
}

export interface DisableLinkJobData {
  url_id: number;
  short_code: string;
}
