/** Warn without logging credentials or changing the driver's database selection. */
export function warnIfDatabaseMissing(uri: string, warn: (message: string) => void): void {
  const match = /^mongodb(?:\+srv)?:\/\/[^/?]+(?:\/([^?]*))?(?:\?.*)?$/.exec(uri);
  if (match && !match[1]) {
    warn('MONGODB_URI has no explicit database name. Add /<database> before the query string to select the intended database; authSource only selects the authentication database.');
  }
}
