import { randomUUID } from 'crypto';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Run before AppModule/ConfigModule is imported. Never fall back to MONGODB_URI/.env.
const base = process.env.TEST_MONGODB_URI;
if (!base || !/^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/?$/.test(base)) {
  throw new Error('E2E requires TEST_MONGODB_URI=mongodb://127.0.0.1:<port> pointing to a disposable local MongoDB. Remote hosts, credentials, database paths and query options are refused.');
}
const database = `travel_e2e_${randomUUID().replaceAll('-', '')}`;
process.env.MONGODB_URI = `${base.replace(/\/$/, '')}/${database}`;
process.env.E2E_DATABASE_NAME = database;
process.env.JWT_ACCESS_SECRET = randomUUID();
process.env.JWT_REFRESH_SECRET = randomUUID();
process.env.JWT_ACCESS_TTL_SECONDS = '900';
process.env.JWT_REFRESH_TTL_SECONDS = '1800';
process.env.SESSION_IDLE_TIMEOUT_SECONDS = '1800';
process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'travel-uploads-e2e-'));
