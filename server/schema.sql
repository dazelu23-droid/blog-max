CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  dek TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body_html TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  author_name TEXT NOT NULL,
  author_initials TEXT NOT NULL,
  author_avatar_color TEXT NOT NULL DEFAULT '#D8CBAE',
  author_bio TEXT NOT NULL,
  published_at TEXT NOT NULL,
  read_minutes INTEGER NOT NULL,
  featured INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  parent_id INTEGER REFERENCES comments(id),
  user_id INTEGER REFERENCES users(id),
  author_name TEXT NOT NULL,
  author_initials TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#CFC4E0',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  avatar_initials TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#CFC4E0',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- One-time migrations (formerly server/db.js's ensureColumn calls for
-- columns not present in the original CREATE TABLE statements above).
-- comments.user_id is already declared above, so no ALTER is needed for it.
-- NOT idempotent like the CREATE TABLE statements above -- this file is meant
-- to run once against a fresh D1 database. Do not re-run after the first deploy.
ALTER TABLE posts ADD COLUMN author_user_id INTEGER REFERENCES users(id);
ALTER TABLE posts ADD COLUMN cover_url TEXT;
ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'en';
