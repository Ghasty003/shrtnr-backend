import { Queue } from "bullmq";
import connection from "../lib/bullmq";

const auditQueue = new Queue("audit", { connection });

export default auditQueue;
