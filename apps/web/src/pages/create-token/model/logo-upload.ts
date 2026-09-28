import { useState } from 'react';
import { ApiError } from '@/shared/api';
import { uploadLogo } from '../api/upload-logo';
import { useSingleFlight } from '@/shared/lib';
import { LOGO_FILE } from '../config/field-limits';

const TOO_LARGE = `Keep the image under ${LOGO_FILE.maxMegabytes} MB`;
const NOT_AN_IMAGE = `Choose a ${LOGO_FILE.typeNames}`;
const UNREADABLE = 'The image could not be shown. Choose it again';

/** What is wrong with a picked file, in words for the creator, or `null` when it may be sent. */
export function checkLogoFile(file: Pick<File, 'size' | 'type'>): string | null {
  if (!(LOGO_FILE.types as readonly string[]).includes(file.type)) return NOT_AN_IMAGE;
  if (file.size > LOGO_FILE.maxBytes) return TOO_LARGE;
  return null;
}

/** Why an upload failed, in words for the creator. Every refusal the API can give has its own line. */
export function describeLogoUploadError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'The image could not be uploaded. Check your connection and try again';
  }
  switch (error.code) {
    case 'LOGO_TOO_LARGE':
      return TOO_LARGE;
    case 'LOGO_NOT_AN_IMAGE':
      return NOT_AN_IMAGE;
    case 'LOGO_STORE_UNAVAILABLE':
      return 'Images cannot be stored right now. Try again in a moment';
    case 'TOO_MANY_REQUESTS': {
      if (error.retryAfterSeconds === undefined) return 'Too many uploads. Try again later';
      const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
      return `Too many uploads. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    }
    default:
      return 'The image could not be uploaded. Try again';
  }
}

/** Where the logo upload is. `failed` keeps the reason for the field to show. */
export type LogoUploadStatus = { kind: 'idle' } | { kind: 'uploading' } | { kind: 'failed'; reason: string };

/**
 * Uploads a picked file and hands back its stored URL through `onStored`.
 * A pick while an upload runs is ignored, so the draft never gets an older file's URL.
 */
export function useLogoUpload(onStored: (url: string) => void) {
  const [status, setStatus] = useState<LogoUploadStatus>({ kind: 'idle' });
  const singleFlight = useSingleFlight();

  async function upload(file: File): Promise<void> {
    await singleFlight(async () => {
      const problem = checkLogoFile(file);
      if (problem) {
        setStatus({ kind: 'failed', reason: problem });
        return;
      }
      setStatus({ kind: 'uploading' });
      try {
        onStored(await uploadLogo(file));
        setStatus({ kind: 'idle' });
      } catch (error) {
        // A 401 has already ended the Session, and the picker asks for a sign in on its own.
        const signedOut = error instanceof ApiError && error.status === 401;
        setStatus(signedOut ? { kind: 'idle' } : { kind: 'failed', reason: describeLogoUploadError(error) });
      }
    });
  }

  /** The stored image would not draw: drop its URL so a launch never writes a broken logo on chain. */
  function rejectUnreadable() {
    onStored('');
    setStatus({ kind: 'failed', reason: UNREADABLE });
  }

  return { status, upload, rejectUnreadable };
}
