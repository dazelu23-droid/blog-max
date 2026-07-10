const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const { db } = require("./db");
const auth = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
const ALLOWED_UPLOAD_MIME = /^(image\/(png|jpe?g|gif|webp)|video\/(mp4|webm|quicktime))$/;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, "");
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_UPLOAD_MIME.test(file.mimetype)) {
      return cb(new Error("Only images (png, jpg, gif, webp) or videos (mp4, webm, mov) are allowed"));
    }
    cb(null, true);
  },
});

app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
  req.user = auth.getUserByToken(req.cookies[auth.SESSION_COOKIE]);
  next();
});
app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Sign in required" });
  next();
}

function setSessionCookie(res, token) {
  res.cookie(auth.SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: auth.SESSION_TTL_MS,
    path: "/",
  });
}

function formatDate(iso) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(title) {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "post"
  );
}

function uniqueSlug(title) {
  const base = slugify(title);
  let slug = base;
  let n = 2;
  while (db.prepare("SELECT 1 FROM posts WHERE slug = ?").get(slug)) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

const MEDIA_TOKEN_RE = /^\[\[media:(\/uploads\/[A-Za-z0-9._-]+)\]\]$/;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)$/i;

function plainTextToHtml(text) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const match = p.match(MEDIA_TOKEN_RE);
      if (match) {
        const url = match[1];
        return VIDEO_EXT_RE.test(url)
          ? `<video src="${url}" controls></video>`
          : `<img src="${url}" alt="" loading="lazy">`;
      }
      return `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

function toListItem(row) {
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category,
    tags: JSON.parse(row.tags),
    authorName: row.author_name,
    authorInitials: row.author_initials,
    authorAvatarColor: row.author_avatar_color,
    coverUrl: row.cover_url || null,
    publishedAt: row.published_at,
    publishedAtLabel: formatDate(row.published_at),
    readMinutes: row.read_minutes,
    featured: !!row.featured,
  };
}

app.get("/api/posts", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM posts ORDER BY published_at DESC")
    .all();
  res.json(rows.map(toListItem));
});

app.get("/api/posts/:slug", (req, res) => {
  const post = db
    .prepare("SELECT * FROM posts WHERE slug = ?")
    .get(req.params.slug);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const commentRows = db
    .prepare("SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC")
    .all(post.id);
  const comments = commentRows
    .filter((c) => !c.parent_id)
    .map((c) => ({
      id: c.id,
      authorName: c.author_name,
      authorInitials: c.author_initials,
      avatarColor: c.avatar_color,
      body: c.body,
      createdAt: c.created_at,
      replies: commentRows
        .filter((r) => r.parent_id === c.id)
        .map((r) => ({
          id: r.id,
          authorName: r.author_name,
          authorInitials: r.author_initials,
          avatarColor: r.avatar_color,
          body: r.body,
          createdAt: r.created_at,
        })),
    }));

  const related = db
    .prepare("SELECT * FROM posts WHERE slug != ? ORDER BY published_at DESC LIMIT 2")
    .all(post.slug)
    .map(toListItem);

  res.json({
    ...toListItem(post),
    dek: post.dek,
    bodyHtml: post.body_html,
    authorBio: post.author_bio,
    commentCount: commentRows.length,
    comments,
    related,
  });
});

app.post("/api/posts", requireAuth, (req, res) => {
  const title = String(req.body?.title || "").trim();
  const bodyText = String(req.body?.body || "").trim();
  if (!title) return res.status(400).json({ error: "Title is required" });
  if (!bodyText) return res.status(400).json({ error: "Post body is required" });

  const category = String(req.body?.category || "").trim() || "Essay";
  const tagsInput = req.body?.tags;
  const tags = Array.isArray(tagsInput)
    ? tagsInput.map((t) => String(t).trim()).filter(Boolean)
    : String(tagsInput || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

  const paragraphs = bodyText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const bodyHtml = plainTextToHtml(bodyText);

  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  const readMinutes = Math.max(1, Math.round(wordCount / 200));

  let excerpt = String(req.body?.excerpt || "").trim();
  if (!excerpt) {
    const firstPara = paragraphs[0] || "";
    excerpt = firstPara.length > 180 ? firstPara.slice(0, 177).trimEnd() + "…" : firstPara;
  }

  const rawCoverUrl = String(req.body?.coverUrl || "").trim();
  const coverUrl = /^\/uploads\/[A-Za-z0-9._-]+$/.test(rawCoverUrl) ? rawCoverUrl : null;

  const slug = uniqueSlug(title);
  const publishedAt = new Date().toISOString().slice(0, 10);
  const authorBio = `${req.user.name} writes on Margin Notes.`;

  db.prepare(`
    INSERT INTO posts
      (slug, title, dek, excerpt, body_html, category, tags, author_name, author_initials,
       author_avatar_color, author_bio, author_user_id, cover_url, published_at, read_minutes, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    slug,
    title,
    excerpt,
    excerpt,
    bodyHtml,
    category,
    JSON.stringify(tags),
    req.user.name,
    req.user.avatar_initials,
    req.user.avatar_color,
    authorBio,
    req.user.id,
    coverUrl,
    publishedAt,
    readMinutes
  );

  const post = db.prepare("SELECT * FROM posts WHERE slug = ?").get(slug);
  res.status(201).json(toListItem(post));
});

app.post("/api/posts/:slug/comments", requireAuth, (req, res) => {
  const post = db
    .prepare("SELECT id FROM posts WHERE slug = ?")
    .get(req.params.slug);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const body = String(req.body?.body || "").trim();
  if (!body) {
    return res.status(400).json({ error: "Comment body is required" });
  }

  const info = db
    .prepare(`
      INSERT INTO comments (post_id, parent_id, user_id, author_name, author_initials, avatar_color, body)
      VALUES (?, NULL, ?, ?, ?, ?, ?)
    `)
    .run(post.id, req.user.id, req.user.name, req.user.avatar_initials, req.user.avatar_color, body);

  const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({
    id: comment.id,
    authorName: comment.author_name,
    authorInitials: comment.author_initials,
    avatarColor: comment.avatar_color,
    body: comment.body,
    createdAt: comment.created_at,
    replies: [],
  });
});

app.post("/api/uploads", requireAuth, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const type = req.file.mimetype.startsWith("video") ? "video" : "image";
    res.status(201).json({ url: `/uploads/${req.file.filename}`, type });
  });
});

app.post("/api/subscribe", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "A valid email is required" });
  }
  try {
    db.prepare("INSERT INTO subscribers (email) VALUES (?)").run(email);
  } catch (e) {
    if (!String(e.message).includes("UNIQUE")) throw e;
  }
  res.status(201).json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  res.json({ user: req.user ? auth.publicUser(req.user) : null });
});

app.post("/api/auth/signup", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!name) return res.status(400).json({ error: "Name is required" });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "A valid email is required" });
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (auth.findUserByEmail(email)) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const user = auth.createUser({ name, email, password });
  const token = auth.createSession(user.id);
  setSessionCookie(res, token);
  res.status(201).json({ user: auth.publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  const user = auth.findUserByEmail(email);
  if (!user || !auth.verifyPassword(password, user.password_salt, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = auth.createSession(user.id);
  setSessionCookie(res, token);
  res.json({ user: auth.publicUser(user) });
});

app.patch("/api/auth/profile", requireAuth, (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();

  if (!name) return res.status(400).json({ error: "Name is required" });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "A valid email is required" });

  const existing = auth.findUserByEmail(email);
  if (existing && existing.id !== req.user.id) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const updated = auth.updateProfile(req.user.id, { name, email });
  res.json({ user: auth.publicUser(updated) });
});

app.post("/api/auth/password", requireAuth, (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");

  if (!auth.verifyPassword(currentPassword, req.user.password_salt, req.user.password_hash)) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }

  auth.updatePassword(req.user.id, newPassword);
  res.status(204).end();
});

app.patch("/api/auth/language", requireAuth, (req, res) => {
  const language = String(req.body?.language || "");
  if (!["en", "es", "fr"].includes(language)) {
    return res.status(400).json({ error: "Unsupported language" });
  }
  auth.updateLanguage(req.user.id, language);
  res.json({ user: auth.publicUser({ ...req.user, language }) });
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.cookies[auth.SESSION_COOKIE];
  if (token) auth.destroySession(token);
  res.clearCookie(auth.SESSION_COOKIE, { path: "/" });
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Margin Notes server running at http://localhost:${PORT}`);
});
