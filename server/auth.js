const crypto = require("node:crypto");
const { db } = require("./db");

const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const AVATAR_COLORS = ["#CFC4E0", "#B9CBB0", "#D8CBAE", "#E3B8A3", "#A9C6D8"];

function initials(name) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "?"
  );
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createUser({ name, email, password }) {
  const { hash, salt } = hashPassword(password);
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  const info = db
    .prepare(`
      INSERT INTO users (name, email, password_hash, password_salt, avatar_initials, avatar_color)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(name, email, hash, salt, initials(name), avatarColor);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
}

function findUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email);
}

function updateProfile(id, { name, email }) {
  db.prepare("UPDATE users SET name = ?, email = ?, avatar_initials = ? WHERE id = ?").run(
    name,
    email,
    initials(name),
    id
  );
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function updatePassword(id, newPassword) {
  const { hash, salt } = hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(hash, salt, id);
}

function updateLanguage(id, language) {
  db.prepare("UPDATE users SET language = ? WHERE id = ?").run(language, id);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    expiresAt
  );
  return token;
}

function destroySession(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function getUserByToken(token) {
  if (!token) return null;
  return (
    db
      .prepare(`
        SELECT users.* FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
      `)
      .get(token) || null
  );
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    initials: u.avatar_initials,
    avatarColor: u.avatar_color,
    language: u.language,
  };
}

module.exports = {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createUser,
  findUserByEmail,
  createSession,
  destroySession,
  getUserByToken,
  publicUser,
  verifyPassword,
  updateProfile,
  updatePassword,
  updateLanguage,
};
