import { useSyncExternalStore } from 'react';
import { isAddress, type Address } from 'viem';

/** The bearer token the API issued to `wallet` when it signed in. Opaque: never decode it. */
export interface Credential {
  wallet: Address;
  token: string;
}

// Versioned so a future shape change can ignore what older builds stored.
const STORAGE_KEY = 'ai-launchpad:credential:v1';

const listeners = new Set<() => void>();

// useSyncExternalStore needs the same object back while storage is unchanged.
let cachedRaw: string | null = null;
let cachedCredential: Credential | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be disabled, e.g. in some private windows.
    return null;
  }
}

function parse(raw: string | null): Credential | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      'wallet' in value &&
      'token' in value &&
      typeof value.wallet === 'string' &&
      isAddress(value.wallet) &&
      typeof value.token === 'string'
    ) {
      return { wallet: value.wallet, token: value.token };
    }
  } catch {
    // Unreadable entries count as signed out.
  }
  return null;
}

export function getCredential(): Credential | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedCredential = parse(raw);
  }
  return cachedCredential;
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function saveCredential(credential: Credential) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(credential));
  } catch {
    // Without storage the session cannot outlive this page; nothing else to do.
  }
  notify();
}

export function clearCredential() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored if storage is unavailable.
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Other tabs signing in or out.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The stored Credential, kept in sync across this tab and others. */
export function useCredential(): Credential | null {
  return useSyncExternalStore(subscribe, getCredential);
}
