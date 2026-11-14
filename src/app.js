'use strict';
const path = require('node:path');
const express = require('express');
const { openDb } = require('./db');

const TYPES = ['ingreso', 'egreso'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`];
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function createApp({ db = openDb() } = {}) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  const TX_SELECT = `
    SELECT t.id, t.type, t.amount, t.description, t.date, t.category_id,
           c.name AS category, c.icon, c.color
    FROM transactions t LEFT JOIN categories c ON c.id = t.category_id`;

  function validateTx(body) {
    const type = body.type;
    const amount = Number(body.amount);
    const date = body.date;
    const description = String(body.description ?? '').trim().slice(0, 200);
    const categoryId = body.category_id == null || body.category_id === '' ? null : Number(body.category_id);
    if (!TYPES.includes(type)) throw new HttpError(400, 'El tipo debe ser "ingreso" o "egreso"');
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'El monto debe ser un número mayor a 0');
    if (typeof date !== 'string' || !DATE_RE.test(date) || Number.isNaN(Date.parse(date))) throw new HttpError(400, 'Fecha inválida (AAAA-MM-DD)');
    if (categoryId !== null) {
      const cat = db.prepare('SELECT type FROM categories WHERE id = ?').get(categoryId);
      if (!cat) throw new HttpError(400, 'La categoría no existe');
      if (cat.type !== type) throw new HttpError(400, 'La categoría no corresponde al tipo de movimiento');
    }
    return { type, amount: Math.round(amount * 100) / 100, date, description, categoryId };
  }

  // ---------- Categorías ----------
  app.get('/api/categories', (req, res) => {
    res.json(db.prepare('SELECT * FROM categories ORDER BY type, name').all());
  });

  app.post('/api/categories', (req, res) => {
    const name = String(req.body.name ?? '').trim().slice(0, 40);
    const { type } = req.body;
    const icon = String(req.body.icon || '🏷️').slice(0, 8);
    const color = /^#[0-9a-fA-F]{6}$/.test(req.body.color) ? req.body.color : '#64748b';
    if (!name) throw new HttpError(400, 'El nombre es obligatorio');
    if (!TYPES.includes(type)) throw new HttpError(400, 'Tipo inválido');
    try {
      const r = db.prepare('INSERT INTO categories (name, type, icon, color) VALUES (?, ?, ?, ?)').run(name, type, icon, color);
      res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Ya existe una categoría con ese nombre');
      throw e;
    }
  });

  app.delete('/api/categories/:id', (req, res) => {
    const r = db.prepare('DELETE FROM categories WHERE id = ?').run(Number(req.params.id));
    if (!r.changes) throw new HttpError(404, 'Categoría no encontrada');
    res.status(204).end();
  });

  // ---------- Movimientos ----------
  function queryTransactions(q) {
    const where = [];
    const params = [];
    if (q.month && MONTH_RE.test(q.month)) {
      const [from, to] = monthRange(q.month);
      where.push('t.date BETWEEN ? AND ?'); params.push(from, to);
    }
    if (q.from && DATE_RE.test(q.from)) { where.push('t.date >= ?'); params.push(q.from); }
    if (q.to && DATE_RE.test(q.to)) { where.push('t.date <= ?'); params.push(q.to); }
    if (TYPES.includes(q.type)) { where.push('t.type = ?'); params.push(q.type); }
    if (q.category_id) { where.push('t.category_id = ?'); params.push(Number(q.category_id)); }
    if (q.q) { where.push('(t.description LIKE ? OR c.name LIKE ?)'); params.push(`%${q.q}%`, `%${q.q}%`); }
    const sql = `${TX_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.date DESC, t.id DESC`;
    return db.prepare(sql).all(...params);
  }

  app.get('/api/transactions', (req, res) => res.json(queryTransactions(req.query)));

  app.post('/api/transactions', (req, res) => {
    const t = validateTx(req.body);
    const r = db.prepare('INSERT INTO transactions (type, amount, category_id, description, date) VALUES (?, ?, ?, ?, ?)')
      .run(t.type, t.amount, t.categoryId, t.description, t.date);
    res.status(201).json(db.prepare(`${TX_SELECT} WHERE t.id = ?`).get(r.lastInsertRowid));
  });

  app.put('/api/transactions/:id', (req, res) => {
    const t = validateTx(req.body);
    const id = Number(req.params.id);
    const r = db.prepare('UPDATE transactions SET type = ?, amount = ?, category_id = ?, description = ?, date = ? WHERE id = ?')
      .run(t.type, t.amount, t.categoryId, t.description, t.date, id);
    if (!r.changes) throw new HttpError(404, 'Movimiento no encontrado');
    res.json(db.prepare(`${TX_SELECT} WHERE t.id = ?`).get(id));
  });

  app.delete('/api/transactions/:id', (req, res) => {
    const r = db.prepare('DELETE FROM transactions WHERE id = ?').run(Number(req.params.id));
    if (!r.changes) throw new HttpError(404, 'Movimiento no encontrado');
    res.status(204).end();
  });

  // ---------- Resumen ----------
  app.get('/api/summary', (req, res) => {
    const month = MONTH_RE.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
    const [from, to] = monthRange(month);
    const totals = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type='ingreso' THEN amount END),0) AS ingresos,
             COALESCE(SUM(CASE WHEN type='egreso' THEN amount END),0) AS egresos,
             COUNT(*) AS count
      FROM transactions WHERE date BETWEEN ? AND ?`).get(from, to);
    const byCategory = db.prepare(`
      SELECT t.type, COALESCE(c.name,'Sin categoría') AS category, COALESCE(c.icon,'❔') AS icon,
             COALESCE(c.color,'#94a3b8') AS color, SUM(t.amount) AS total
      FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.date BETWEEN ? AND ?
      GROUP BY t.type, t.category_id ORDER BY total DESC`).all(from, to);
    const trendStart = monthRange(shiftMonth(month, -5))[0];
    const rows = db.prepare(`
      SELECT substr(date,1,7) AS month,
             SUM(CASE WHEN type='ingreso' THEN amount ELSE 0 END) AS ingresos,
             SUM(CASE WHEN type='egreso' THEN amount ELSE 0 END) AS egresos
      FROM transactions WHERE date BETWEEN ? AND ? GROUP BY month`).all(trendStart, to);
    const byMonth = Object.fromEntries(rows.map(r => [r.month, r]));
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const m = shiftMonth(month, -i);
      trend.push({ month: m, ingresos: byMonth[m]?.ingresos ?? 0, egresos: byMonth[m]?.egresos ?? 0 });
    }
    const { balance } = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type='ingreso' THEN amount ELSE -amount END),0) AS balance
      FROM transactions WHERE date <= ?`).get(to);
    res.json({ month, ...totals, balance: totals.ingresos - totals.egresos, accumulated: balance, byCategory, trend });
  });

  // ---------- Exportar CSV ----------
  app.get('/api/export.csv', (req, res) => {
    const rows = queryTransactions(req.query);
    const esc = v => {
      let s = String(v ?? '');
      if (/^[=+\-@]/.test(s)) s = "'" + s; // evita inyección de fórmulas en Excel
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = ['Fecha,Tipo,Categoría,Descripción,Monto'];
    for (const r of rows) lines.push([r.date, r.type, r.category, r.description, r.amount].map((v, i) => i === 4 ? v : esc(v)).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="movimientos.csv"');
    res.send('﻿' + lines.join('\n'));
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Error interno del servidor' : err.message });
  });

  return app;
}

module.exports = { createApp, monthRange, shiftMonth };
