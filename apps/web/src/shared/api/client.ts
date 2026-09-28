import { clearCredential, getCredential, type Credential } from '@/shared/auth';
import { apiUrl } from '@/shared/config';

/** A failed API call: the HTTP status, the API's message, and its `code` to branch on when it sent one. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  /** Seconds until a rate-limited call may be repeated, from `Retry-After`, when the API sent one. */
  readonly retryAfterSeconds: number | undefined;

  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface Envelope<T> {
  success: boolean;
  message?: string;
  code?: string;
  data?: T;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Sent as JSON, or as multipart when it is `FormData`. */
  body?: unknown;
  /** The Credential to send as a bearer token: the stored one by default, `null` for none. */
  credential?: Credential | null;
}

/** `Retry-After` in seconds; the header may also be a date, which is left as unknown. */
function retryAfter(response: Response): number | undefined {
  const header = response.headers.get('Retry-After');
  if (header === null || !/^\d+$/.test(header.trim())) return undefined;
  return Number(header);
}

/**
 * Calls the API and returns the `data` of its envelope.
 * A 401 on a call that sent the stored Credential clears it, since that is the API's only signal
 * that the Session is over.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const credential = options.credential === undefined ? getCredential() : options.credential;
  const headers: Record<string, string> = {};
  const { body } = options;
  // FormData goes as it is, so the browser sets the multipart boundary; anything else is JSON.
  const multipart = body instanceof FormData;
  if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
  if (credential) headers.Authorization = `Bearer ${credential.token}`;

  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: multipart || body === undefined ? body : JSON.stringify(body),
  });

  const envelope = (await response.json().catch(() => null)) as Envelope<T> | null;

  if (!response.ok || !envelope?.success) {
    // Another tab may have stored a new Credential meanwhile; only clear the one that failed.
    if (response.status === 401 && credential && getCredential()?.token === credential.token) clearCredential();
    throw new ApiError(
      response.status,
      envelope?.message ?? response.statusText,
      envelope?.code,
      response.status === 429 ? retryAfter(response) : undefined,
    );
  }
  return envelope.data as T;
}
