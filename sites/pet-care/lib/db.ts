import { Pool } from 'pg';

const globalForDb = globalThis as typeof globalThis & {
  appointmentDbPool?: Pool;
};

export class DatabaseConfigurationError extends Error {
  constructor() {
    super('DATABASE_URL is not configured');
    this.name = 'DatabaseConfigurationError';
  }
}

export function getDbPool(): Pool {
  if (globalForDb.appointmentDbPool) {
    return globalForDb.appointmentDbPool;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new DatabaseConfigurationError();
  }

  globalForDb.appointmentDbPool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000
  });

  return globalForDb.appointmentDbPool;
}
