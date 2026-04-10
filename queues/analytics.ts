import { Queue } from "bullmq";
import connection from "../lib/bullmq";

const analyticsQueue = new Queue("analytics", { connection });

export default analyticsQueue;
