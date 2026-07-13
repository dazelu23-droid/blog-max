const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PBKDF2_ITERATIONS = 100_000;
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

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function timingSafeEqualHex(aHex, bHex) {
  if (aHex.length !== bHex.length) return false;
  let diff = 0;
  for (let i = 0; i < aHex.length; i++) {
    diff |= aHex.charCodeAt(i) ^ bHex.charCodeAt(i);
  }
  return diff === 0;
}

async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    512
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

async function verifyPassword(password, salt, expectedHash) {
  const { hash } = await hashPassword(password, salt);
  return timingSafeEqualHex(hash, expectedHash);
}

async function createUser(db, { name, email, password }) {
  const { hash, salt } = await hashPassword(password);
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  const info = await db
    .prepare(`
      INSERT INTO users (name, email, password_hash, password_salt, avatar_initials, avatar_color)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(name, email, hash, salt, initials(name), avatarColor)
    .run();
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(info.meta.last_row_id).first();
}

function findUserByEmail(db, email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
}

async function updateProfile(db, id, { name, email }) {
  await db
    .prepare("UPDATE users SET name = ?, email = ?, avatar_initials = ? WHERE id = ?")
    .bind(name, email, initials(name), id)
    .run();
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}

async function updatePassword(db, id, newPassword) {
  const { hash, salt } = await hashPassword(newPassword);
  await db
    .prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
    .bind(hash, salt, id)
    .run();
}

function updateLanguage(db, id, language) {
  return db.prepare("UPDATE users SET language = ? WHERE id = ?").bind(language, id).run();
}

async function createSession(db, userId) {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db
    .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expiresAt)
    .run();
  return token;
}

function destroySession(db, token) {
  return db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
}

function getUserByToken(db, token) {
  if (!token) return null;
  return db
    .prepare(`
      SELECT users.* FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
    `)
    .bind(token)
    .first();
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

export {
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
