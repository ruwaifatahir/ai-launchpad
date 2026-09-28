import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import { LOGO_FILE } from '../config/field-limits';
import { checkLogoFile, describeLogoUploadError } from './logo-upload';

const file = (overrides: Partial<{ size: number; type: string }> = {}) => ({
  size: 1024,
  type: 'image/png',
  ...overrides,
});

describe('checkLogoFile', () => {
  it('accepts each of the four image types up to 4 MB', () => {
    for (const type of LOGO_FILE.types) {
      expect(checkLogoFile(file({ type, size: LOGO_FILE.maxBytes }))).toBeNull();
    }
  });

  it('refuses a file over 4 MB before it is sent', () => {
    expect(checkLogoFile(file({ size: LOGO_FILE.maxBytes + 1 }))).toBe('Keep the image under 4 MB');
  });

  it('refuses a type the API would not store, including SVG', () => {
    expect(checkLogoFile(file({ type: 'image/svg+xml' }))).toBe('Choose a PNG, JPEG, WebP or GIF');
    expect(checkLogoFile(file({ type: '' }))).toBe('Choose a PNG, JPEG, WebP or GIF');
  });
});

describe('describeLogoUploadError', () => {
  it('names each refusal the API can give', () => {
    expect(describeLogoUploadError(new ApiError(413, 'Payload Too Large', 'LOGO_TOO_LARGE'))).toBe(
      'Keep the image under 4 MB',
    );
    expect(describeLogoUploadError(new ApiError(415, 'Unsupported', 'LOGO_NOT_AN_IMAGE'))).toBe(
      'Choose a PNG, JPEG, WebP or GIF',
    );
    expect(describeLogoUploadError(new ApiError(503, 'Unavailable', 'LOGO_STORE_UNAVAILABLE'))).toBe(
      'Images cannot be stored right now. Try again in a moment',
    );
  });

  it('tells the creator when to try again after too many uploads, in whole minutes rounded up', () => {
    expect(describeLogoUploadError(new ApiError(429, 'Too many', 'TOO_MANY_REQUESTS', 61))).toBe(
      'Too many uploads. Try again in 2 minutes',
    );
    expect(describeLogoUploadError(new ApiError(429, 'Too many', 'TOO_MANY_REQUESTS', 30))).toBe(
      'Too many uploads. Try again in 1 minute',
    );
  });

  it('falls back to a plain message when the wait is unknown or the error is not the API', () => {
    expect(describeLogoUploadError(new ApiError(429, 'Too many', 'TOO_MANY_REQUESTS'))).toBe(
      'Too many uploads. Try again later',
    );
    expect(describeLogoUploadError(new ApiError(400, 'Bad Request', 'LOGO_REQUIRED'))).toBe(
      'The image could not be uploaded. Try again',
    );
    expect(describeLogoUploadError(new TypeError('Failed to fetch'))).toBe(
      'The image could not be uploaded. Check your connection and try again',
    );
  });
});
