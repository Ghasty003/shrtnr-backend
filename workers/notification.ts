import { Worker } from "bullmq";
import connection from "../lib/bullmq";
import {
  NOTIFICATION_JOB_NAMES,
  SendOtpJobData,
  SendWelcomeJobData,
} from "../jobs/notification";
import { sendMail, otpEmailHtml, welcomeEmailHtml } from "../utils/email";

const notificationWorker = new Worker(
  "notifications",
  async (job) => {
    switch (job.name) {
      case NOTIFICATION_JOB_NAMES.SEND_OTP: {
        const { to, username, otp } = job.data as SendOtpJobData;
        await sendMail({
          to,
          subject: "Your SHRTNR verification code",
          html: otpEmailHtml(otp, username),
        });
        break;
      }
      case NOTIFICATION_JOB_NAMES.SEND_WELCOME: {
        const { to, username } = job.data as SendWelcomeJobData;
        await sendMail({
          to,
          subject: "Welcome to SHRTNR",
          html: welcomeEmailHtml(username),
        });
        break;
      }
      default:
        throw new Error(`Unknown job: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 5, // email is I/O bound but SMTP servers have rate limits
  },
);

notificationWorker.on("active", (job) => {
  console.log("Job active: ", job.id);
});

notificationWorker.on("failed", (job, err) => {
  console.error(`[Notification Worker] Job ${job?.id} failed:`, err.message);
});

notificationWorker.on("completed", (job) => {
  console.log(`[Notification Worker] Job ${job.id} completed`);
});

export default notificationWorker;
