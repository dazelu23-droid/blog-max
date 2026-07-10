const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = path.join(__dirname, "blog.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
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
`);

function ensureColumn(table, column, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

ensureColumn("comments", "user_id", "INTEGER REFERENCES users(id)");
ensureColumn("posts", "author_user_id", "INTEGER REFERENCES users(id)");
ensureColumn("posts", "cover_url", "TEXT");
ensureColumn("users", "language", "TEXT NOT NULL DEFAULT 'en'");

function seed() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM posts").get().n;
  if (count > 0) return;

  const insertPost = db.prepare(`
    INSERT INTO posts
      (slug, title, dek, excerpt, body_html, category, tags, author_name, author_initials,
       author_avatar_color, author_bio, published_at, read_minutes, featured)
    VALUES (@slug, @title, @dek, @excerpt, @body_html, @category, @tags, @author_name, @author_initials,
       @author_avatar_color, @author_bio, @published_at, @read_minutes, @featured)
  `);

  const posts = [
    {
      slug: "pleasure-of-finishing-slowly",
      title: "The pleasure of finishing something slowly",
      dek: "I spent four weekends resurfacing an old desk. Here's what the waiting taught me about the work I usually rush through.",
      excerpt: "I spent four weekends resurfacing an old desk. Here's what the waiting taught me about work I usually rush.",
      body_html: `
        <p>The desk had been in the hallway for a year, under a stack of things I meant to deal with. It was solid oak and genuinely ugly — a decade of someone else's coffee rings sealed under yellowing varnish. I could have sanded it in an afternoon with a machine. Instead I did it by hand, and it took four weekends.</p>
        <p>I don't recommend this as a productivity method. I recommend it as the opposite of one.</p>
        <h2>The part I wanted to skip</h2>
        <p>Every step wanted to be hurried. Stripping is tedious. Sanding is more tedious. But somewhere in the second weekend I stopped checking how far I'd gotten and started noticing the grain — the way it pulled the cloth in one direction and resisted in the other.</p>
        <blockquote>Rushing had been hiding the thing I was working on from me the whole time.</blockquote>
        <p>When the first coat of oil went on, the grain came up like a photograph developing. I'd have missed it entirely at the speed I usually work.</p>
        <p>I think the lesson isn't really about furniture. It's that some things only reveal themselves at a pace slower than the one we default to. The trick is choosing, now and then, to go the long way on purpose.</p>
      `,
      category: "Craft",
      tags: JSON.stringify(["craft", "slow living", "attention"]),
      author_name: "Ellis Warde",
      author_initials: "EW",
      author_avatar_color: "#D8CBAE",
      author_bio: "Writes Margin Notes from a small flat with too many half-finished projects. Believes most things are better done a little slower.",
      published_at: "2026-07-06",
      read_minutes: 7,
      featured: 1,
    },
    {
      slug: "three-line-journal",
      title: "A three-line journal I've kept for a year",
      dek: "Small enough to never skip, honest enough to be worth reading back.",
      excerpt: "Small enough to never skip, honest enough to be worth reading back.",
      body_html: `
        <p>A year ago I gave up on keeping a proper journal and started writing exactly three lines a night instead: one thing that happened, one thing I noticed, one thing I'd rather forget.</p>
        <p>The limit is the whole point. Three lines fit into the two minutes before sleep when a full page never did. And reading them back months later, the small ones — a smell, an overheard sentence — turn out to be the entries I actually wanted.</p>
        <h2>What it's taught me</h2>
        <p>Mostly that a habit survives on how little it asks of you, not how much you intend it to hold.</p>
      `,
      category: "Habits",
      tags: JSON.stringify(["habits", "writing", "attention"]),
      author_name: "Ellis Warde",
      author_initials: "EW",
      author_avatar_color: "#D8CBAE",
      author_bio: "Writes Margin Notes from a small flat with too many half-finished projects. Believes most things are better done a little slower.",
      published_at: "2026-06-29",
      read_minutes: 5,
      featured: 0,
    },
    {
      slug: "bread-that-forgives-a-distracted-week",
      title: "Bread that forgives a distracted week",
      dek: "A slow loaf that fits itself around the day instead of ruling it.",
      excerpt: "A slow loaf that fits itself around the day instead of ruling it.",
      body_html: `
        <p>Most bread recipes assume you have nothing else going on. This one assumes the opposite — a cold, slow rise that's just as happy waiting eighteen hours as twelve.</p>
        <p>I mix it half-asleep before bed and forget about it. Whatever the next day holds, the dough is patient with me in a way my calendar isn't.</p>
        <h2>The only rule</h2>
        <p>Don't rush the bake. Everything else can bend.</p>
      `,
      category: "Kitchen",
      tags: JSON.stringify(["kitchen", "slow living"]),
      author_name: "Ellis Warde",
      author_initials: "EW",
      author_avatar_color: "#D8CBAE",
      author_bio: "Writes Margin Notes from a small flat with too many half-finished projects. Believes most things are better done a little slower.",
      published_at: "2026-06-22",
      read_minutes: 6,
      featured: 0,
    },
    {
      slug: "walking-the-same-route-on-purpose",
      title: "Walking the same route on purpose",
      dek: "What you stop seeing, and how to start seeing it again.",
      excerpt: "What you stop seeing, and how to start seeing it again.",
      body_html: `
        <p>I've walked the same six blocks to the train for three years. For most of that time I saw almost none of it — the route had become a blank space between two points.</p>
        <p>Lately I've been trying to notice one new thing each trip: a window box, a repaired fence post, the way the light changes on the same wall by season. The route hasn't gotten longer. I've just started paying for it what it's actually worth.</p>
        <h2>Attention as a practice</h2>
        <p>Familiarity is supposed to breed contempt. More often it just breeds absence — and that's the part worth fixing.</p>
      `,
      category: "Attention",
      tags: JSON.stringify(["attention", "habits"]),
      author_name: "Ellis Warde",
      author_initials: "EW",
      author_avatar_color: "#D8CBAE",
      author_bio: "Writes Margin Notes from a small flat with too many half-finished projects. Believes most things are better done a little slower.",
      published_at: "2026-06-15",
      read_minutes: 4,
      featured: 0,
    },
  ];

  for (const p of posts) insertPost.run(p);

  const postId = db.prepare("SELECT id FROM posts WHERE slug = ?").get("pleasure-of-finishing-slowly").id;
  const insertComment = db.prepare(`
    INSERT INTO comments (post_id, parent_id, author_name, author_initials, avatar_color, body, created_at)
    VALUES (@post_id, @parent_id, @author_name, @author_initials, @avatar_color, @body, @created_at)
  `);
  const c1 = insertComment.run({
    post_id: postId, parent_id: null, author_name: "Mira R.", author_initials: "MR",
    avatar_color: "#CFC4E0", body: "This got me. I sanded a chair last month and had the exact same moment when the oil went on.",
    created_at: "2026-07-08 10:00:00",
  });
  insertComment.run({
    post_id: postId, parent_id: c1.lastInsertRowid, author_name: "Ellis Warde", author_initials: "EW",
    avatar_color: "#D8CBAE", body: "The oil moment is the best part. Post a photo somewhere — I'd love to see it.",
    created_at: "2026-07-08 11:30:00",
  });
  insertComment.run({
    post_id: postId, parent_id: null, author_name: "Jon T.", author_initials: "JT",
    avatar_color: "#B9CBB0", body: "Needed this reminder today. Saving it.",
    created_at: "2026-07-09 09:15:00",
  });
}

seed();

module.exports = { db };
