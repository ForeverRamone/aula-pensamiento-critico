// Base de datos: usa el SQLite que Node trae de serie (node:sqlite).
// Ventaja: no hay que compilar módulos nativos, así que el contenedor Docker
// funciona igual en cualquier Synology (Intel o ARM) sin herramientas de build.
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

// La carpeta /data es la que se monta como volumen: aquí viven la base de
// datos y los archivos subidos, y sobrevive a reinicios y actualizaciones.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'aula.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'member',
    bio           TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS materials (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session     INTEGER NOT NULL DEFAULT 0,
    kind        TEXT    NOT NULL DEFAULT 'curso',
    title       TEXT    NOT NULL,
    description TEXT,
    url         TEXT,
    embed_url   TEXT,
    file_path   TEXT,
    file_name   TEXT,
    file_kind   TEXT,
    slide_count INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT    NOT NULL DEFAULT 'idea',
    title      TEXT,
    body       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid     TEXT    PRIMARY KEY,
    data    TEXT    NOT NULL,
    expires INTEGER NOT NULL
  );

  -- Ajustes editables desde el panel de administración (código de invitación,
  -- registro abierto/cerrado, nombre del sitio, nº de sesiones…).
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  -- Actividad final rediseñada: una entrega por participante.
  CREATE TABLE IF NOT EXISTS submissions (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    task_title TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Texto de cada apartado (fase) de la actividad de cada participante.
  CREATE TABLE IF NOT EXISTS activity_texts (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    part       TEXT    NOT NULL,
    body       TEXT,
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, part)
  );

  -- Archivos y enlaces adjuntos a un apartado de la actividad.
  CREATE TABLE IF NOT EXISTS activity_files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    part        TEXT    NOT NULL,
    title       TEXT,
    url         TEXT,
    embed_url   TEXT,
    file_path   TEXT,
    file_name   TEXT,
    file_kind   TEXT,
    slide_count INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migración defensiva: añade columnas nuevas si la base de datos es de una
// versión anterior (no borra ni toca los datos existentes).
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('materials', 'session', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('materials', 'kind', "TEXT NOT NULL DEFAULT 'curso'");
ensureColumn('materials', 'file_kind', 'TEXT');
ensureColumn('materials', 'slide_count', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('materials', 'embed_url', 'TEXT');
ensureColumn('users', 'bio', 'TEXT');

module.exports = { db, DATA_DIR, UPLOAD_DIR };
