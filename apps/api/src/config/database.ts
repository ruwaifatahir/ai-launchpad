import { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";

// One client, and so one connection pool, for the whole process. The pool size and
// timeout ride on DATABASE_URL (connection_limit, pool_timeout) so a deployment tunes
// them without a code change.
//
// Prisma's own warnings and errors are emitted as events and routed through winston,
// so they carry the request context and reach the log shipper as JSON like every
// other line, rather than going to stdout in Prisma's own format.
const prisma = new PrismaClient({
  log: [
    { emit: "event", level: "warn" },
    { emit: "event", level: "error" },
  ],
});

prisma.$on("warn", (event) => logger.warn("prisma warning", { message: event.message }));
prisma.$on("error", (event) => logger.error("prisma error", { message: event.message }));

export default prisma;
