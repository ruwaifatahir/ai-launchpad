/**
 * The token a Creator left for X to connect, kept for this tab only. X's return names it, except
 * when the link expired, so this is the fallback.
 */
const STORAGE_KEY = 'ai-launchpad:x-return:v1';

export function saveXReturn(token: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage can be disabled; the return then relies on the token X sends back.
  }
}

/** The token last saved in this tab. Kept until the next one replaces it, so a reload of the landing still finds it. */
export function readXReturn(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
