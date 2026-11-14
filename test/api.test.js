'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp, monthRange, shiftMonth } = require('../src/app');
const { openDb } = require('../src/db');

let server, base;
before(async () => {
  server = createApp({ db: openDb(':memory:') }).listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const req = async (path, opts = {}) => {
  const res = await fetch(base + path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* texto plano */ }
  return { status: res.status, data };
};

test('utilidades de fechas', () => {
  assert.deepEqual(monthRange('2024-02'), ['2024-02-01', '2024-02-29']);
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-11', 2), '2027-01');
});

test('categorías por defecto', async () => {
  const { status, data } = await req('/api/categories');
  assert.equal(status, 200);
  assert.ok(data.some(c => c.name === 'Comida' && c.type === 'egreso'));
  assert.ok(data.some(c => c.name === 'Sueldo' && c.type === 'ingreso'));
});

test('CRUD de movimientos y resumen', async () => {
  const cats = (await req('/api/categories')).data;
  const sueldo = cats.find(c => c.name === 'Sueldo');
  const comida = cats.find(c => c.name === 'Comida');

  const a = await req('/api/transactions', { method: 'POST', body: { type: 'ingreso', amount: 1000, date: '2026-03-01', category_id: sueldo.id, description: 'Sueldo marzo' } });
  assert.equal(a.status, 201);
  const b = await req('/api/transactions', { method: 'POST', body: { type: 'egreso', amount: 250.555, date: '2026-03-10', category_id: comida.id, description: 'Pizza' } });
  assert.equal(b.status, 201);
  assert.equal(b.data.amount, 250.56);
  assert.equal(b.data.category, 'Comida');
  await req('/api/transactions', { method: 'POST', body: { type: 'egreso', amount: 100, date: '2026-02-15' } });

  const list = await req('/api/transactions?month=2026-03');
  assert.equal(list.data.length, 2);
  assert.equal((await req('/api/transactions?q=pizza')).data.length, 1);
  assert.equal((await req('/api/transactions?type=ingreso')).data.length, 1);

  const s = (await req('/api/summary?month=2026-03')).data;
  assert.equal(s.ingresos, 1000);
  assert.equal(s.egresos, 250.56);
  assert.equal(s.balance, 749.44);
  assert.equal(s.accumulated, 649.44);
  assert.equal(s.trend.length, 6);
  assert.equal(s.trend.at(-1).month, '2026-03');
  assert.equal(s.trend.at(-2).egresos, 100);

  const upd = await req(`/api/transactions/${b.data.id}`, { method: 'PUT', body: { type: 'egreso', amount: 300, date: '2026-03-10', category_id: comida.id, description: 'Pizza y helado' } });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.amount, 300);

  const csv = await req('/api/export.csv?month=2026-03');
  assert.match(csv.data, /Pizza y helado/);

  assert.equal((await req(`/api/transactions/${b.data.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await req(`/api/transactions/${b.data.id}`, { method: 'DELETE' })).status, 404);
});

test('validaciones', async () => {
  const cats = (await req('/api/categories')).data;
  const sueldo = cats.find(c => c.name === 'Sueldo');
  const bad = [
    { type: 'otro', amount: 1, date: '2026-01-01' },
    { type: 'egreso', amount: -5, date: '2026-01-01' },
    { type: 'egreso', amount: 'abc', date: '2026-01-01' },
    { type: 'egreso', amount: 5, date: '01/01/2026' },
    { type: 'egreso', amount: 5, date: '2026-01-01', category_id: sueldo.id },
    { type: 'egreso', amount: 5, date: '2026-01-01', category_id: 99999 },
  ];
  for (const body of bad) {
    const r = await req('/api/transactions', { method: 'POST', body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.ok(r.data.error);
  }
});

test('crear y borrar categoría deja movimientos sin categoría', async () => {
  const c = await req('/api/categories', { method: 'POST', body: { name: 'Mascotas', type: 'egreso', icon: '🐶', color: '#ff0000' } });
  assert.equal(c.status, 201);
  assert.equal((await req('/api/categories', { method: 'POST', body: { name: 'Mascotas', type: 'egreso' } })).status, 409);
  const t = await req('/api/transactions', { method: 'POST', body: { type: 'egreso', amount: 50, date: '2026-05-05', category_id: c.data.id } });
  assert.equal((await req(`/api/categories/${c.data.id}`, { method: 'DELETE' })).status, 204);
  const after = (await req('/api/transactions?month=2026-05')).data.find(x => x.id === t.data.id);
  assert.equal(after.category_id, null);
});
