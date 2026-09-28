import prisma from "@/config/database";

export const findLogoUrlByHash = async (hash: string) => {
  const upload = await prisma.logoUpload.findFirst({
    where: { hash },
    select: { url: true },
  });

  return upload?.url ?? null;
};

export const recordLogoUpload = (upload: { wallet: string; hash: string; url: string }) =>
  prisma.logoUpload.create({ data: upload });
