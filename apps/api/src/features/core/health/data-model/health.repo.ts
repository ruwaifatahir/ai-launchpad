import prisma from "@/config/database";

export const pingDatabase = () => prisma.$queryRaw`SELECT 1`;
