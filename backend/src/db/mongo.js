/** MongoDB Atlas adapter (heterogeneous / semi-structured data: observations, posts, alerts, snapshots). */
class MongoCollection {
  constructor(col) {
    this.col = col;
  }
  async insertOne(doc) {
    const { insertedId } = await this.col.insertOne({ ...doc });
    return { _id: insertedId, ...doc };
  }
  async insertMany(docs) {
    if (!docs.length) return [];
    await this.col.insertMany(docs.map((d) => ({ ...d })));
    return docs;
  }
  async find(filter = {}, { sort, limit } = {}) {
    let cur = this.col.find(filter);
    if (sort) cur = cur.sort(sort);
    if (limit) cur = cur.limit(limit);
    return cur.toArray();
  }
  async findOne(filter = {}, opts = {}) {
    return (await this.find(filter, { ...opts, limit: 1 }))[0] ?? null;
  }
  async updateOne(filter, patch) {
    const r = await this.col.updateOne(filter, { $set: patch });
    return r.matchedCount;
  }
  async count(filter = {}) {
    return this.col.countDocuments(filter);
  }
  async deleteMany(filter = {}) {
    return (await this.col.deleteMany(filter)).deletedCount;
  }
}

export async function connectMongo(uri, dbName) {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(dbName);
  // TTL keeps the raw observation stream bounded; indexes support the dashboard queries.
  await db.collection('observations').createIndex({ regionId: 1, ts: -1 });
  await db.collection('observations').createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });
  await db.collection('posts').createIndex({ regionId: 1, ts: -1 });
  await db.collection('alerts').createIndex({ active: 1, regionId: 1 });
  const cache = new Map();
  return {
    mode: 'mongodb',
    collection: (n) => {
      if (!cache.has(n)) cache.set(n, new MongoCollection(db.collection(n)));
      return cache.get(n);
    },
    close: () => client.close(),
  };
}
