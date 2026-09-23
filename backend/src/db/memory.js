import { randomUUID } from 'node:crypto';

const ops = {
  $gte: (a, b) => a >= b,
  $gt: (a, b) => a > b,
  $lte: (a, b) => a <= b,
  $lt: (a, b) => a < b,
  $in: (a, b) => b.includes(a),
  $ne: (a, b) => a !== b,
};

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([k, cond]) => {
    const v = doc[k];
    if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
      return Object.entries(cond).every(([op, arg]) => ops[op]?.(v, arg));
    }
    return v === cond;
  });
}

/** Minimal document collection with a Mongo-like surface (used when MONGO_URI is not set). */
export class MemoryCollection {
  constructor(name, cap = 20000) {
    this.name = name;
    this.docs = [];
    this.cap = cap;
  }
  async insertOne(doc) {
    const d = { _id: randomUUID(), ...doc };
    this.docs.push(d);
    if (this.docs.length > this.cap) this.docs.splice(0, this.docs.length - this.cap);
    return d;
  }
  async insertMany(docs) {
    return Promise.all(docs.map((d) => this.insertOne(d)));
  }
  async find(filter = {}, { sort, limit } = {}) {
    let out = this.docs.filter((d) => matches(d, filter));
    if (sort) {
      const [[key, dir]] = Object.entries(sort);
      out = [...out].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * dir);
    }
    if (limit) out = out.slice(0, limit);
    return out.map((d) => ({ ...d }));
  }
  async findOne(filter = {}, opts) {
    return (await this.find(filter, { ...opts, limit: 1 }))[0] ?? null;
  }
  async updateOne(filter, patch) {
    const d = this.docs.find((x) => matches(x, filter));
    if (!d) return 0;
    Object.assign(d, patch);
    return 1;
  }
  async count(filter = {}) {
    return this.docs.filter((d) => matches(d, filter)).length;
  }
  async deleteMany(filter = {}) {
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => !matches(d, filter));
    return before - this.docs.length;
  }
}

export class MemoryDocStore {
  constructor() {
    this.mode = 'memory';
    this.cols = new Map();
  }
  collection(name) {
    if (!this.cols.has(name)) this.cols.set(name, new MemoryCollection(name));
    return this.cols.get(name);
  }
  async close() {}
}

/** In-memory stand-in for the PostgreSQL relational store (users + resource inventory). */
export class MemoryRelationalStore {
  constructor() {
    this.mode = 'memory';
    this.users = [];
    this.resources = new Map();
  }
  async findUserByEmail(email) {
    return this.users.find((u) => u.email === email.toLowerCase()) ?? null;
  }
  async createUser({ email, name, role, passwordHash }) {
    const u = { id: this.users.length + 1, email: email.toLowerCase(), name, role, passwordHash };
    this.users.push(u);
    return u;
  }
  async listResources() {
    return [...this.resources.values()].map((r) => ({ ...r }));
  }
  async upsertResources(list) {
    for (const r of list) this.resources.set(r.id, { committed: 0, ...this.resources.get(r.id), ...r });
  }
  async setCommitted(id, committed) {
    const r = this.resources.get(id);
    if (r) r.committed = committed;
  }
  async resetCommitted() {
    for (const r of this.resources.values()) r.committed = 0;
  }
  async close() {}
}
