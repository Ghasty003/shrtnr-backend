import { Queue } from "bullmq";
import connection from "../lib/bullmq";

const notificationQueue = new Queue("notifications", { connection });

export default notificationQueue;
