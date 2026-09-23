import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.AUTO_START_PIPELINE = 'false';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/server.js');

let server;
let base;
let db;

before(async () => {
  const created = await createApp();
  db = created.db;
  server = http.createServer(created.app);
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
});

async function req(path, opts = {}) {
  const res = await fetch(base + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

test('GET /api/health reports db mode and ml status', async () => {
  const { status, body } = await req('/api/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.ok(body.dbMode.docs);
});

test('login with seeded admin works and dashboard requires that token', async () => {
  const denied = await req('/api/dashboard/summary');
  assert.equal(denied.status, 401);

  const login = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@resqfusion.in', password: 'Admin@123' }) });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);

  const summary = await req('/api/dashboard/summary', { headers: { Authorization: `Bearer ${login.body.token}` } });
  assert.equal(summary.status, 200);
  assert.equal(typeof summary.body.ticks, 'number');
});

test('citizen role cannot access the coordinator dashboard', async () => {
  const login = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'citizen@resqfusion.in', password: 'Citizen@123' }) });
  const res = await req('/api/dashboard/summary', { headers: { Authorization: `Bearer ${login.body.token}` } });
  assert.equal(res.status, 403);
});

test('citizen can submit a geo-tagged report without logging in', async () => {
  const res = await req('/api/citizen/report', {
    method: 'POST',
    body: JSON.stringify({ text: 'Please help, water rising fast near our house', lat: 25.6, lng: 85.13 }),
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.report.source, 'citizen');
});

test('register rejects an invalid role and duplicate email', async () => {
  const bad = await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: 'x@x.com', password: 'p', name: 'X', role: 'superadmin' }) });
  assert.equal(bad.status, 400);
  const dup = await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: 'admin@resqfusion.in', password: 'p', name: 'X', role: 'citizen' }) });
  assert.equal(dup.status, 409);
});
