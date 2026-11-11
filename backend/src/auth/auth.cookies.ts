import type { CookieOptions } from 'express';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const REFRESH_COOKIE_PATH = '/api/auth';

export function clearCookieOptions(path = '/'): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path,
  };
}

export function authCookieOptions(maxAgeSeconds: number, path = '/'): CookieOptions {
  return { ...clearCookieOptions(path), maxAge: maxAgeSeconds * 1000 };
}