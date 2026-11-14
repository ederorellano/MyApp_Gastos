'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_CATEGORIES = [
  // Egresos
  ['Comida', 'egreso', '🍔', '#ef4444'],
  ['Supermercado', 'egreso', '🛒', '#f97316'],
  ['Transporte', 'egreso', '🚌', '#eab308'],
  ['Vivienda', 'egreso', '🏠', '#84cc16'],
  ['Servicios', 'egreso', '💡', '#14b8a6'],
  ['Salud', 'egreso', '💊', '#06b6d4'],
  ['Educación', 'egreso', '📚', '#3b82f6'],
  ['Ocio', 'egreso', '🎬', '#8b5cf6'],
  ['Ropa', 'egreso', '👕', '#d946ef'],
  ['Otros gastos', 'egreso', '📦', '#64748b'],
  // Ingresos
  ['Sueldo', 'ingreso', '💼', '#10b981'],
  ['Freelance', 'ingreso', '💻', '#22c55e'],
  ['Inversiones', 'ingreso', '📈', '#0ea5e9'],
  ['Regalos', 'ingreso', '🎁', '#f43f5e'],
  ['Otros ingresos', 'ingreso', '💰', '#a3a3a3'],
];

function openDb(file = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'gastos.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('ingreso','egreso')),
      icon TEXT NOT NULL DEFAULT '🏷️',
      color TEXT NOT NULL DEFAULT '#64748b',
      UNIQUE (name, type)
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('ingreso','egreso')),
      amount REAL NOT NULL CHECK (amount > 0),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
  `);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM categories').get();
  if (n === 0) {
    const ins = db.prepare('INSERT INTO categories (name, type, icon, color) VALUES (?, ?, ?, ?)');
    for (const c of DEFAULT_CATEGORIES) ins.run(...c);
  }
  return db;
}

module.exports = { openDb };
