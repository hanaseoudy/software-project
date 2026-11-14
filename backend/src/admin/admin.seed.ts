import 'reflect-metadata';
import { createConnection } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AccountStatus, User, UserRole, UserSchema } from '../users/schemas/user.schema';

class AdminSeedError extends Error {}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new AdminSeedError(message);
}

export async function seedAdmin(env: NodeJS.ProcessEnv) {
  const uri = env.MONGODB_URI;
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  const firstName = env.ADMIN_FIRST_NAME?.trim() || 'System';
  const lastName = env.ADMIN_LAST_NAME?.trim() || 'Admin';

  check(typeof uri === 'string' && uri.trim().length > 0, 'Set MONGODB_URI before seeding.');
  check(
    typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    'Set ADMIN_EMAIL to a valid email address.',
  );
  check(
    typeof password === 'string' &&
      password.length >= 8 &&
      /[A-Za-z]/.test(password) &&
      /\d/.test(password) &&
      Buffer.byteLength(password, 'utf8') <= 72,
    'ADMIN_PASSWORD must be at least 8 characters with a letter and a digit, and at most 72 bytes.',
  );

  const connection = createConnection();
  const userModel = connection.model(User.name, UserSchema);

  try {
    await connection.openUri(uri, { serverSelectionTimeoutMS: 10000 });

    const existing = await userModel.findOne({ email });
    if (existing) {
      check(
        existing.role === UserRole.ADMIN,
        `An account with ${email} already exists and is not an admin. Use a different ADMIN_EMAIL.`,
      );
      console.log(`Admin ${email} already exists. Nothing changed.`);
      return;
    }

    await userModel.create({
      firstName,
      lastName,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: UserRole.ADMIN,
      status: AccountStatus.ACTIVE,
    });
    console.log(`ACC-18: admin account ${email} created.`);
  } finally {
    await connection.destroy();
  }
}

if (require.main === module) {
  seedAdmin(process.env).catch((error: unknown) => {
    console.error(
      error instanceof AdminSeedError
        ? error.message
        : 'Admin seed failed. Check MONGODB_URI and database connectivity, then rerun.',
    );
    process.exitCode = 1;
  });
}