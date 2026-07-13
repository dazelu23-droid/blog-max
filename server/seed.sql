-- Demo content, ported from server/db.js's seed(). Run once, right after
-- schema.sql, on a fresh database. Not safe to re-run (UNIQUE slug/email
-- collisions) -- do not include in the redeploy flow.

INSERT INTO posts
  (slug, title, dek, excerpt, body_html, category, tags, author_name, author_initials,
   author_avatar_color, author_bio, published_at, read_minutes, featured)
VALUES
  ('pleasure-of-finishing-slowly',
   'The pleasure of finishing something slowly',
   'I spent four weekends resurfacing an old desk. Here''s what the waiting taught me about the work I usually rush through.',
   'I spent four weekends resurfacing an old desk. Here''s what the waiting taught me about work I usually rush.',
   '
        <p>The desk had been in the hallway for a year, under a stack of things I meant to deal with. It was solid oak and genuinely ugly — a decade of someone else''s coffee rings sealed under yellowing varnish. I could have sanded it in an afternoon with a machine. Instead I did it by hand, and it took four weekends.</p>
        <p>I don''t recommend this as a productivity method. I recommend it as the opposite of one.</p>
        <h2>The part I wanted to skip</h2>
        <p>Every step wanted to be hurried. Stripping is tedious. Sanding is more tedious. But somewhere in the second weekend I stopped checking how far I''d gotten and started noticing the grain — the way it pulled the cloth in one direction and resisted in the other.</p>
        <blockquote>Rushing had been hiding the thing I was working on from me the whole time.</blockquote>
        <p>When the first coat of oil went on, the grain came up like a photograph developing. I''d have missed it entirely at the speed I usually work.</p>
        <p>I think the lesson isn''t really about furniture. It''s that some things only reveal themselves at a pace slower than the one we default to. The trick is choosing, now and then, to go the long way on purpose.</p>
      ',
   'Craft', '["craft","slow living","attention"]', 'Ellis Warde', 'EW', '#D8CBAE',
   'Writes Margin Notes from a small flat with too many half-finished projects. Believes most things are better done a little slower.',
   '2026-07-06', 7, 1),

  ('three-line-journal',
   'A three-line journal I''ve kept for a year',
   'Small enough to never skip, honest enough to be worth reading back.',
   'Small enough to never skip, honest enough to be worth reading back.',
   '
        <p>A year ago I gave up on keeping a proper journal and started writing exactly three lines a night instead: one thing that happened, one thing I noticed, one thing I''d rather forget.</p>
        <p>The limit is the whole point. Three lines fit into the two minutes before sleep when a full page never did. And reading them back months later, the small ones — a smell, an overheard sentence — turn out to be the entries I actually wanted.</p>
        <h2>What it''s taught me</h2>
        <p>Mostly that a habit survives on how little it asks of you, not how much you intend it to hold.</p>
      ',
   'Habits', '["habits","writing","attention"]', 'Ellis Warde', 'EW', '#D8CBAE',
   'Writes Margin Notes from a small flat with too many half-finished projects. Believes most things are better done a little slower.',
   '2026-06-29', 5, 0),

  ('bread-that-forgives-a-distracted-week',
   'Bread that forgives a distracted week',
   'A slow loaf that fits itself around the day instead of ruling it.',
   'A slow loaf that fits itself around the day instead of ruling it.',
   '
        <p>Most bread recipes assume you have nothing else going on. This one assumes the opposite — a cold, slow rise that''s just as happy waiting eighteen hours as twelve.</p>
        <p>I mix it half-asleep before bed and forget about it. Whatever the next day holds, the dough is patient with me in a way my calendar isn''t.</p>
        <h2>The only rule</h2>
        <p>Don''t rush the bake. Everything else can bend.</p>
      ',
   'Kitchen', '["kitchen","slow living"]', 'Ellis Warde', 'EW', '#D8CBAE',
   'Writes Margin Notes from a small flat with too many half-finished projects. Believes most things are better done a little slower.',
   '2026-06-22', 6, 0),

  ('walking-the-same-route-on-purpose',
   'Walking the same route on purpose',
   'What you stop seeing, and how to start seeing it again.',
   'What you stop seeing, and how to start seeing it again.',
   '
        <p>I''ve walked the same six blocks to the train for three years. For most of that time I saw almost none of it — the route had become a blank space between two points.</p>
        <p>Lately I''ve been trying to notice one new thing each trip: a window box, a repaired fence post, the way the light changes on the same wall by season. The route hasn''t gotten longer. I''ve just started paying for it what it''s actually worth.</p>
        <h2>Attention as a practice</h2>
        <p>Familiarity is supposed to breed contempt. More often it just breeds absence — and that''s the part worth fixing.</p>
      ',
   'Attention', '["attention","habits"]', 'Ellis Warde', 'EW', '#D8CBAE',
   'Writes Margin Notes from a small flat with too many half-finished projects. Believes most things are better done a little slower.',
   '2026-06-15', 4, 0);

INSERT INTO comments (post_id, parent_id, author_name, author_initials, avatar_color, body, created_at)
VALUES (
  (SELECT id FROM posts WHERE slug = 'pleasure-of-finishing-slowly'),
  NULL, 'Mira R.', 'MR', '#CFC4E0',
  'This got me. I sanded a chair last month and had the exact same moment when the oil went on.',
  '2026-07-08 10:00:00'
);

INSERT INTO comments (post_id, parent_id, author_name, author_initials, avatar_color, body, created_at)
VALUES (
  (SELECT id FROM posts WHERE slug = 'pleasure-of-finishing-slowly'),
  (SELECT id FROM comments WHERE body LIKE 'This got me.%'),
  'Ellis Warde', 'EW', '#D8CBAE',
  'The oil moment is the best part. Post a photo somewhere — I''d love to see it.',
  '2026-07-08 11:30:00'
);

INSERT INTO comments (post_id, parent_id, author_name, author_initials, avatar_color, body, created_at)
VALUES (
  (SELECT id FROM posts WHERE slug = 'pleasure-of-finishing-slowly'),
  NULL, 'Jon T.', 'JT', '#B9CBB0',
  'Needed this reminder today. Saving it.',
  '2026-07-09 09:15:00'
);
