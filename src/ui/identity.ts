/**
 * Account identity.
 *
 * The user ID always comes from `GET /users/@me` so a token can never be
 * paired with somebody else's ID. `getAuthorId()` from the page is only used
 * as a fallback when the request fails for a non-authentication reason.
 */

import { getAuthorId, getToken } from '../core/token';
import type { ApiClientFactory, ApiClientPort } from './ports';

/** A confirmed account, or the reason it could not be confirmed. */
export type IdentityResult =
  | {
      readonly ok: true;
      readonly token: string;
      readonly authorId: string;
      readonly client: ApiClientPort;
    }
  | { readonly ok: false; readonly error: string };

/**
 * True when an error means Discord rejected the credentials.
 *
 * @param error - Anything thrown by the API client
 * @returns Whether the error carries the UNAUTHORIZED code
 */
export function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'UNAUTHORIZED'
  );
}

/**
 * Extracts a message from an unknown throwable.
 *
 * @param error - Anything thrown
 * @param fallback - Message to use when the throwable carries none
 * @returns A displayable message
 */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Binds a token to the account that owns it.
 *
 * @param token - Discord auth token
 * @param createApiClient - Client factory
 * @param allowPageFallback - Whether to fall back to the page's user ID on a
 *   non-authentication failure
 * @returns The confirmed identity, or an error to show the user
 */
export async function confirmToken(
  token: string,
  createApiClient: ApiClientFactory,
  allowPageFallback: boolean,
): Promise<IdentityResult> {
  let client: ApiClientPort;
  try {
    // The real client validates the token shape in its constructor.
    client = createApiClient(token);
  } catch {
    return { ok: false, error: 'That does not look like a Discord token.' };
  }

  try {
    const user = await client.getCurrentUser();
    return { ok: true, token, authorId: user.id, client };
  } catch (error) {
    if (isUnauthorized(error)) {
      return { ok: false, error: 'Token rejected by Discord.' };
    }
    const fallbackId = allowPageFallback ? getAuthorId() : null;
    if (fallbackId) {
      return { ok: true, token, authorId: fallbackId, client };
    }
    return { ok: false, error: errorMessage(error, 'Could not confirm your Discord account.') };
  }
}

/**
 * Resolves the token from the page and confirms which account it belongs to.
 *
 * @param createApiClient - Client factory
 * @returns The confirmed identity, or an error to show the user
 */
export async function resolveIdentity(createApiClient: ApiClientFactory): Promise<IdentityResult> {
  let token: string | null = null;
  try {
    token = getToken();
  } catch {
    token = null;
  }

  if (!token) {
    return {
      ok: false,
      error: 'Could not detect your Discord token. Make sure you are logged in.',
    };
  }

  return confirmToken(token, createApiClient, true);
}
