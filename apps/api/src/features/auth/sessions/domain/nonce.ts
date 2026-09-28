import { generateSiweNonce } from "viem/siwe";
import { storeNonce } from "@/features/auth/sessions/sessions.storage";

export const issueNonce = async () => {
  const nonce = generateSiweNonce();

  await storeNonce(nonce);

  return { nonce };
};
