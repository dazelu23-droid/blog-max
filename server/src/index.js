import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import * as auth from "./auth.js";

const app = new Hono();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_UPLOAD_MIME = /^(image\/(png|jpe?g|gif|webp)|video\/(mp4|webm|quicktime))$/;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

app.use(async (c, next) => {
  const token = getCookie(c, auth.SESSION_COOKIE);
  c.set("user", await auth.getUserByToken(c.env.DB, token));
  await next();
});

function requireAuth(c, next) {
  if (!c.get("user")) return c.json({ error: "Sign in required" }, 401);
  return next();
}

function setSessionCookie(c, token) {
  setCookie(c, auth.SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: auth.SESSION_TTL_MS / 1000,
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

async function uniqueSlug(db, title) {
  const base = slugify(title);
  let slug = base;
  let n = 2;
  while (await db.prepare("SELECT 1 FROM posts WHERE slug = ?").bind(slug).first()) {
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

app.get("/api/posts", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM posts ORDER BY published_at DESC"
  ).all();
  return c.json(results.map(toListItem));
});

app.get("/api/posts/:slug", async (c) => {
  const post = await c.env.DB.prepare("SELECT * FROM posts WHERE slug = ?")
    .bind(c.req.param("slug"))
    .first();
  if (!post) return c.json({ error: "Post not found" }, 404);

  const { results: commentRows } = await c.env.DB.prepare(
    "SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC"
  )
    .bind(post.id)
    .all();
  const comments = commentRows
    .filter((cm) => !cm.parent_id)
    .map((cm) => ({
      id: cm.id,
      authorName: cm.author_name,
      authorInitials: cm.author_initials,
      avatarColor: cm.avatar_color,
      body: cm.body,
      createdAt: cm.created_at,
      replies: commentRows
        .filter((r) => r.parent_id === cm.id)
        .map((r) => ({
          id: r.id,
          authorName: r.author_name,
          authorInitials: r.author_initials,
          avatarColor: r.avatar_color,
          body: r.body,
          createdAt: r.created_at,
        })),
    }));

  const { results: related } = await c.env.DB.prepare(
    "SELECT * FROM posts WHERE slug != ? ORDER BY published_at DESC LIMIT 2"
  )
    .bind(post.slug)
    .all();

  return c.json({
    ...toListItem(post),
    dek: post.dek,
    bodyHtml: post.body_html,
    authorBio: post.author_bio,
    commentCount: commentRows.length,
    comments,
    related: related.map(toListItem),
  });
});

app.post("/api/posts", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  const title = String(body?.title || "").trim();
  const bodyText = String(body?.body || "").trim();
  if (!title) return c.json({ error: "Title is required" }, 400);
  if (!bodyText) return c.json({ error: "Post body is required" }, 400);

  const category = String(body?.category || "").trim() || "Essay";
  const tagsInput = body?.tags;
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

  let excerpt = String(body?.excerpt || "").trim();
  if (!excerpt) {
    const firstPara = paragraphs[0] || "";
    excerpt = firstPara.length > 180 ? firstPara.slice(0, 177).trimEnd() + "…" : firstPara;
  }

  const rawCoverUrl = String(body?.coverUrl || "").trim();
  const coverUrl = /^\/uploads\/[A-Za-z0-9._-]+$/.test(rawCoverUrl) ? rawCoverUrl : null;

  const slug = await uniqueSlug(c.env.DB, title);
  const publishedAt = new Date().toISOString().slice(0, 10);
  const authorBio = `${user.name} writes on Margin Notes.`;

  await c.env.DB.prepare(`
    INSERT INTO posts
      (slug, title, dek, excerpt, body_html, category, tags, author_name, author_initials,
       author_avatar_color, author_bio, author_user_id, cover_url, published_at, read_minutes, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `)
    .bind(
      slug,
      title,
      excerpt,
      excerpt,
      bodyHtml,
      category,
      JSON.stringify(tags),
      user.name,
      user.avatar_initials,
      user.avatar_color,
      authorBio,
      user.id,
      coverUrl,
      publishedAt,
      readMinutes
    )
    .run();

  const post = await c.env.DB.prepare("SELECT * FROM posts WHERE slug = ?").bind(slug).first();
  return c.json(toListItem(post), 201);
});

app.post("/api/posts/:slug/comments", requireAuth, async (c) => {
  const user = c.get("user");
  const post = await c.env.DB.prepare("SELECT id FROM posts WHERE slug = ?")
    .bind(c.req.param("slug"))
    .first();
  if (!post) return c.json({ error: "Post not found" }, 404);

  const reqBody = await c.req.json();
  const body = String(reqBody?.body || "").trim();
  if (!body) return c.json({ error: "Comment body is required" }, 400);

  const info = await c.env.DB.prepare(`
      INSERT INTO comments (post_id, parent_id, user_id, author_name, author_initials, avatar_color, body)
      VALUES (?, NULL, ?, ?, ?, ?, ?)
    `)
    .bind(post.id, user.id, user.name, user.avatar_initials, user.avatar_color, body)
    .run();

  const comment = await c.env.DB.prepare("SELECT * FROM comments WHERE id = ?")
    .bind(info.meta.last_row_id)
    .first();
  return c.json(
    {
      id: comment.id,
      authorName: comment.author_name,
      authorInitials: comment.author_initials,
      avatarColor: comment.avatar_color,
      body: comment.body,
      createdAt: comment.created_at,
      replies: [],
    },
    201
  );
});

app.post("/api/uploads", requireAuth, async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return c.json({ error: "No file uploaded" }, 400);
  }
  if (!ALLOWED_UPLOAD_MIME.test(file.type)) {
    return c.json(
      { error: "Only images (png, jpg, gif, webp) or videos (mp4, webm, mov) are allowed" },
      400
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: "File too large (25MB max)" }, 400);
  }

  const ext = (file.name.match(/\.[A-Za-z0-9]+$/) || [""])[0]
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "");
  const key = `${crypto.randomUUID()}${ext}`;

  await c.env.UPLOADS.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const type = file.type.startsWith("video") ? "video" : "image";
  return c.json({ url: `/uploads/${key}`, type }, 201);
});

app.get("/uploads/:key", async (c) => {
  const obj = await c.env.UPLOADS.get(c.req.param("key"));
  if (!obj) return c.notFound();
  c.header("Content-Type", obj.httpMetadata?.contentType || "application/octet-stream");
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return c.body(obj.body);
});

app.post("/api/subscribe", async (c) => {
  const body = await c.req.json();
  const email = String(body?.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return c.json({ error: "A valid email is required" }, 400);
  }
  try {
    await c.env.DB.prepare("INSERT INTO subscribers (email) VALUES (?)").bind(email).run();
  } catch (e) {
    if (!String(e.message).includes("UNIQUE")) throw e;
  }
  return c.json({ ok: true }, 201);
});

app.get("/api/auth/me", (c) => {
  const user = c.get("user");
  return c.json({ user: user ? auth.publicUser(user) : null });
});

app.post("/api/auth/signup", async (c) => {
  const body = await c.req.json();
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");

  if (!name) return c.json({ error: "Name is required" }, 400);
  if (!EMAIL_RE.test(email)) return c.json({ error: "A valid email is required" }, 400);
  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }
  if (await auth.findUserByEmail(c.env.DB, email)) {
    return c.json({ error: "An account with that email already exists" }, 409);
  }

  const user = await auth.createUser(c.env.DB, { name, email, password });
  const token = await auth.createSession(c.env.DB, user.id);
  setSessionCookie(c, token);
  return c.json({ user: auth.publicUser(user) }, 201);
});

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json();
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");

  const user = await auth.findUserByEmail(c.env.DB, email);
  if (!user || !(await auth.verifyPassword(password, user.password_salt, user.password_hash))) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const token = await auth.createSession(c.env.DB, user.id);
  setSessionCookie(c, token);
  return c.json({ user: auth.publicUser(user) });
});

app.patch("/api/auth/profile", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();

  if (!name) return c.json({ error: "Name is required" }, 400);
  if (!EMAIL_RE.test(email)) return c.json({ error: "A valid email is required" }, 400);

  const existing = await auth.findUserByEmail(c.env.DB, email);
  if (existing && existing.id !== user.id) {
    return c.json({ error: "An account with that email already exists" }, 409);
  }

  const updated = await auth.updateProfile(c.env.DB, user.id, { name, email });
  return c.json({ user: auth.publicUser(updated) });
});

app.post("/api/auth/password", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");

  if (!(await auth.verifyPassword(currentPassword, user.password_salt, user.password_hash))) {
    return c.json({ error: "Current password is incorrect" }, 401);
  }
  if (newPassword.length < 8) {
    return c.json({ error: "New password must be at least 8 characters" }, 400);
  }

  await auth.updatePassword(c.env.DB, user.id, newPassword);
  return c.body(null, 204);
});

app.patch("/api/auth/language", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const language = String(body?.language || "");
  if (!["en", "es", "fr"].includes(language)) {
    return c.json({ error: "Unsupported language" }, 400);
  }
  await auth.updateLanguage(c.env.DB, user.id, language);
  return c.json({ user: auth.publicUser({ ...user, language }) });
});

app.post("/api/auth/logout", async (c) => {
  const token = getCookie(c, auth.SESSION_COOKIE);
  if (token) await auth.destroySession(c.env.DB, token);
  deleteCookie(c, auth.SESSION_COOKIE, { path: "/" });
  return c.body(null, 204);
});

export default app;
