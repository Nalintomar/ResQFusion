/** PostgreSQL adapter (structured operational data: users and resource inventory). */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','relief','citizen')),
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS resources (
  id        TEXT PRIMARY KEY,
  type      TEXT NOT NULL CHECK (type IN ('shelter','ambulance','volunteer','relief')),
  name      TEXT NOT NULL,
  lat       DOUBLE PRECISION NOT NULL,
  lng       DOUBLE PRECISION NOT NULL,
  quantity  INTEGER NOT NULL,
  committed INTEGER NOT NULL DEFAULT 0
);
`;

export async function connectPostgres(url) {
  const pg = await import('pg');
  const Pool = pg.default?.Pool ?? pg.Pool;
  const pool = new Pool({ connectionString: url, max: 5 });
  await pool.query(SCHEMA);
  const mapUser = (r) => r && { id: r.id, email: r.email, name: r.name, role: r.role, passwordHash: r.password_hash };
  return {
    mode: 'postgresql',
    async findUserByEmail(email) {
      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
      return mapUser(rows[0]) ?? null;
    },
    async createUser({ email, name, role, passwordHash }) {
      const { rows } = await pool.query(
        'INSERT INTO users (email, name, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING *',
        [email.toLowerCase(), name, role, passwordHash],
      );
      return mapUser(rows[0]);
    },
    async listResources() {
      const { rows } = await pool.query('SELECT * FROM resources ORDER BY id');
      return rows;
    },
    async upsertResources(list) {
      for (const r of list) {
        await pool.query(
          `INSERT INTO resources (id,type,name,lat,lng,quantity) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (id) DO UPDATE SET type=$2, name=$3, lat=$4, lng=$5, quantity=$6`,
          [r.id, r.type, r.name, r.lat, r.lng, r.quantity],
        );
      }
    },
    async setCommitted(id, committed) {
      await pool.query('UPDATE resources SET committed = $2 WHERE id = $1', [id, committed]);
    },
    async resetCommitted() {
      await pool.query('UPDATE resources SET committed = 0');
    },
    close: () => pool.end(),
  };
}
