import { apiRequest } from '@/shared/api';

/**
 * Stores `file` as a token logo and returns the URL it is served from, for the `logo` of a launch.
 * Needs the stored Credential. The same file from any wallet gets the same URL, so re-uploading is safe.
 */
export async function uploadLogo(file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  const { url } = await apiRequest<{ url: string }>('/api/v1/core/logos', { method: 'POST', body });
  return url;
}
