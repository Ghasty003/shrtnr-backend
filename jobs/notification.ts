export const NOTIFICATION_JOB_NAMES = {
  SEND_OTP: "send-otp",
  SEND_WELCOME: "send-welcome",
} as const;

export interface SendOtpJobData {
  to: string;
  username: string;
  otp: string;
}

export interface SendWelcomeJobData {
  to: string;
  username: string;
}
