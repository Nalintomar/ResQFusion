import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { RESOURCE_SEED } from '../data/resourcesSeed.js';
import { MemoryDocStore, MemoryRelationalStore } from './memory.js';

/**
 * Two stores, as in the synopsis:
 *   docs  -> MongoDB   (heterogeneous observations, posts, alerts, risk snapshots)
 *   sql   -> PostgreSQL (users, resource inventory)
 * Either falls back to an in-memory implementation with the same interface when its connection
 * string is not configured or the server is unreachable, so the prototype always starts.
 */
export async function initDb(cfg = config, log = console) {
  let docs;
  let sql;

  if (cfg.mongoUri) {
    try {
      const { connectMongo } = await import('./mongo.js');
      docs = await connectMongo(cfg.mongoUri, cfg.mongoDb);
      log.info?.('[db] MongoDB connected');
    } catch (e) {
      log.warn?.(`[db] MongoDB unavailable (${e.message}); using in-memory document store`);
    }
  }
  docs ??= new MemoryDocStore();

  if (cfg.pgUrl) {
    try {
      const { connectPostgres } = await import('./postgres.js');
      sql = await connectPostgres(cfg.pgUrl);
      log.info?.('[db] PostgreSQL connected');
    } catch (e) {
      log.warn?.(`[db] PostgreSQL unavailable (${e.message}); using in-memory relational store`);
    }
  }
  sql ??= new MemoryRelationalStore();

  await seed(sql);
  return { docs, sql, close: async () => Promise.all([docs.close(), sql.close()]) };
}

async function seed(sql) {
  const existing = await sql.listResources();
  if (existing.length === 0) await sql.upsertResources(RESOURCE_SEED);

  const users = [
    { email: 'admin@resqfusion.in', name: 'District Control Room', role: 'admin', pw: 'Admin@123' },
    { email: 'relief@resqfusion.in', name: 'Relief Team Lead', role: 'relief', pw: 'Relief@123' },
    { email: 'citizen@resqfusion.in', name: 'Demo Citizen', role: 'citizen', pw: 'Citizen@123' },
  ];
  for (const u of users) {
    if (!(await sql.findUserByEmail(u.email))) {
      await sql.createUser({ email: u.email, name: u.name, role: u.role, passwordHash: bcrypt.hashSync(u.pw, 8) });
    }
  }
}
