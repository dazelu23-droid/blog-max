function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

function avatarHtml(initials, color, extraClass) {
  return `<div class="avatar${extraClass ? " " + extraClass : ""}" style="background:${color}">${escapeHtml(initials)}</div>`;
}

let cachedUser;

async function getCurrentUser() {
  if (cachedUser !== undefined) return cachedUser;
  const { user } = await api("/api/auth/me");
  cachedUser = user;
  return user;
}

function initPasswordToggles(root = document) {
  root.querySelectorAll(".password-toggle").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      const input = btn.previousElementSibling;
      if (!input) return;
      const willShow = input.type === "password";
      input.type = willShow ? "text" : "password";
      btn.textContent = willShow ? t("hide") : t("show");
      btn.setAttribute("aria-label", willShow ? t("hide") : t("show"));
    });
  });
}

function currentPathForRedirect() {
  return encodeURIComponent(location.pathname + location.search);
}

async function syncLanguageFromAccount() {
  const user = await getCurrentUser();
  if (user && user.language && user.language !== currentLang) {
    setLang(user.language);
  }
  return user;
}

async function initAuthNav() {
  const slot = document.getElementById("auth-slot");
  if (!slot) return;
  const user = await getCurrentUser();
  if (user) {
    slot.innerHTML = `
      <span class="nav-auth">
        <a href="/new-post.html">${t("nav_write")}</a>
        <a href="/account.html">${escapeHtml(user.name)}</a>
        <button type="button" class="link-btn" id="signout-btn">${t("nav_signOut")}</button>
      </span>
    `;
    document.getElementById("signout-btn").addEventListener("click", async () => {
      await api("/api/auth/logout", { method: "POST" });
      cachedUser = null;
      location.href = "/";
    });
  } else {
    slot.innerHTML = `<a href="/login.html?redirect=${currentPathForRedirect()}">${t("nav_signIn")}</a>`;
  }
}

function coverHtml(coverUrl) {
  return coverUrl ? `<img src="${coverUrl}" alt="" loading="lazy">` : "";
}

function featuredHtml(post) {
  return `
    <a class="featured-post" href="/post.html?slug=${encodeURIComponent(post.slug)}">
      <div class="cover">${coverHtml(post.coverUrl)}</div>
      <div>
        <div class="tag-row">
          <span class="tag-featured">${t("featured_badge")}</span>
          <span class="tag-category">· ${escapeHtml(post.category)}</span>
        </div>
        <h2>${escapeHtml(post.title)}</h2>
        <p>${escapeHtml(post.excerpt)}</p>
        <div class="byline">
          ${avatarHtml(post.authorInitials, post.authorAvatarColor)}
          <div class="byline-text">${escapeHtml(post.authorName)} · <span class="muted">${formatDateLabel(post.publishedAt)} · ${t("minShort", { n: post.readMinutes })}</span></div>
        </div>
      </div>
    </a>
  `;
}

function cardHtml(post) {
  return `
    <a class="post-card" href="/post.html?slug=${encodeURIComponent(post.slug)}">
      <div class="cover">${coverHtml(post.coverUrl)}</div>
      <div class="card-category">${escapeHtml(post.category)}</div>
      <h3>${escapeHtml(post.title)}</h3>
      <p>${escapeHtml(post.excerpt)}</p>
      <div class="meta">${formatDateLabel(post.publishedAt)} · ${t("minShort", { n: post.readMinutes })}</div>
    </a>
  `;
}

async function renderIndexPage() {
  const featuredSlot = document.getElementById("featured-slot");
  const gridSlot = document.getElementById("grid-slot");
  try {
    const posts = await api("/api/posts");
    const featured = posts.find((p) => p.featured) || posts[0];
    const rest = posts.filter((p) => p.slug !== featured?.slug);

    featuredSlot.innerHTML = featured ? featuredHtml(featured) : "";
    gridSlot.innerHTML = rest.map(cardHtml).join("") || `<p class="state-msg">${t("noPostsYet")}</p>`;
  } catch (e) {
    featuredSlot.innerHTML = `<p class="state-msg">${t("couldntLoadPosts", { error: escapeHtml(e.message) })}</p>`;
  }

  const form = document.getElementById("subscribe-form");
  const note = document.getElementById("subscribe-note");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = new FormData(form).get("email");
    note.textContent = t("subscribing");
    note.style.color = "#5C5344";
    try {
      await api("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      note.textContent = t("subscribed_thanks");
      note.style.color = "#3F6B3F";
      form.reset();
    } catch (e) {
      note.textContent = e.message;
      note.style.color = "#B0532C";
    }
  });
}

function relativeTime(sqlDate) {
  const then = new Date(sqlDate.replace(" ", "T") + "Z").getTime();
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return t("justNow");
  if (mins < 60) return t(mins === 1 ? "minuteAgo" : "minutesAgo", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t(hours === 1 ? "hourAgo" : "hoursAgo", { n: hours });
  const days = Math.round(hours / 24);
  return t(days === 1 ? "dayAgo" : "daysAgo", { n: days });
}

function commentHtml(c) {
  const replies = (c.replies || [])
    .map(
      (r) => `
      <div class="comment reply">
        ${avatarHtml(r.authorInitials, r.avatarColor)}
        <div>
          <div class="comment-head"><span class="name">${escapeHtml(r.authorName)}</span> <span class="muted">· ${relativeTime(r.createdAt)}</span></div>
          <p>${escapeHtml(r.body)}</p>
        </div>
      </div>`
    )
    .join("");
  return `
    <div class="comment">
      ${avatarHtml(c.authorInitials, c.avatarColor)}
      <div>
        <div class="comment-head"><span class="name">${escapeHtml(c.authorName)}</span> <span class="muted">· ${relativeTime(c.createdAt)}</span></div>
        <p>${escapeHtml(c.body)}</p>
      </div>
    </div>
    ${replies}
  `;
}

function commentFormHtml(user) {
  if (user) {
    return `
      <form class="comment-form" id="comment-form">
        ${avatarHtml(user.initials, user.avatarColor)}
        <div class="comment-form-fields">
          <textarea name="body" placeholder="${escapeHtml(t("commentPlaceholder"))}" required></textarea>
          <div class="comment-form-actions">
            <button type="submit" class="btn btn-dark">${t("postResponseBtn")}</button>
          </div>
          <div class="form-note" id="comment-note"></div>
        </div>
      </form>
    `;
  }
  return `
    <div class="signin-prompt">
      <p>${t("signInToCommentPrompt")}</p>
      <a class="btn btn-dark" href="/login.html?redirect=${currentPathForRedirect()}">${t("signInToComment")}</a>
    </div>
  `;
}

function postHtml(post, user) {
  return `
    <article class="post">
      <div class="tag-row">
        <span class="tag-featured">${escapeHtml(post.category)}</span>
        <span class="tag-category">· ${t("tag_essay")}</span>
      </div>
      <h1>${escapeHtml(post.title)}</h1>
      <p class="dek">${escapeHtml(post.dek)}</p>
      <div class="article-byline">
        ${avatarHtml(post.authorInitials, post.authorAvatarColor)}
        <div>
          <div class="name">${escapeHtml(post.authorName)}</div>
          <div class="muted">${formatDateLabel(post.publishedAt)} · ${t("minRead", { n: post.readMinutes })}</div>
        </div>
      </div>
    </article>

    <div class="cover post-cover">${coverHtml(post.coverUrl)}</div>

    <div class="post-body">${post.bodyHtml}</div>

    <div class="tags">
      ${post.tags.map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("")}
    </div>

    <div class="author-bio">
      ${avatarHtml(post.authorInitials, post.authorAvatarColor)}
      <div>
        <div class="name">${escapeHtml(post.authorName)}</div>
        <p>${escapeHtml(post.authorBio)}</p>
      </div>
    </div>

    ${
      post.related.length
        ? `<div class="related">
            <div class="section-label">${t("keepReading")}</div>
            <div class="related-grid">
              ${post.related
                .map(
                  (r) => `
                <a href="/post.html?slug=${encodeURIComponent(r.slug)}">
                  <div class="cover">${coverHtml(r.coverUrl)}</div>
                  <h4>${escapeHtml(r.title)}</h4>
                  <div class="meta">${formatDateLabel(r.publishedAt)} · ${t("minShort", { n: r.readMinutes })}</div>
                </a>`
                )
                .join("")}
            </div>
          </div>`
        : ""
    }

    <div class="comments-section">
      <h3>${t(post.commentCount === 1 ? "response_one" : "response_other", { n: post.commentCount })}</h3>
      <div class="comment-list" id="comment-list">
        ${post.comments.map(commentHtml).join("") || `<p class="state-msg" style="padding:0;">${t("beFirstToRespond")}</p>`}
      </div>

      ${commentFormHtml(user)}
    </div>

    <footer class="site-footer">
      <span>© 2026 Margin Notes</span>
      <div class="links"><a href="/">${t("footer_rss")}</a><a href="/">${t("footer_archive")}</a></div>
    </footer>
  `;
}

async function renderPostPage() {
  const slot = document.getElementById("post-slot");
  const slug = new URLSearchParams(location.search).get("slug");
  if (!slug) {
    slot.innerHTML = `<p class="state-msg">${t("noPostSpecified")} <a href="/">${t("backToHome")}</a></p>`;
    return;
  }

  let post, user;
  try {
    [post, user] = await Promise.all([
      api(`/api/posts/${encodeURIComponent(slug)}`),
      getCurrentUser(),
    ]);
  } catch (e) {
    slot.innerHTML = `<p class="state-msg">${t("couldntLoadPost", { error: escapeHtml(e.message) })} — <a href="/">${t("backToHome")}</a></p>`;
    return;
  }

  document.title = `${post.title} — Margin Notes`;
  slot.innerHTML = postHtml(post, user);

  const form = document.getElementById("comment-form");
  if (!form) return;
  const note = document.getElementById("comment-note");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    note.textContent = t("saving");
    note.style.color = "#5C5344";
    try {
      const comment = await api(`/api/posts/${encodeURIComponent(slug)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: data.get("body") }),
      });
      document.getElementById("comment-list").insertAdjacentHTML("beforeend", commentHtml(comment));
      form.reset();
      note.textContent = "";
    } catch (e) {
      note.textContent = e.message;
      note.style.color = "#B0532C";
    }
  });
}

function getRedirectParam() {
  return new URLSearchParams(location.search).get("redirect") || "";
}

function wireAuthSwitchLink(id) {
  const link = document.getElementById(id);
  const redirect = getRedirectParam();
  if (link && redirect) {
    const url = new URL(link.href, location.origin);
    url.searchParams.set("redirect", redirect);
    link.href = url.pathname + url.search;
  }
}

function initLoginPage() {
  wireAuthSwitchLink("signup-link");
  const form = document.getElementById("login-form");
  const note = document.getElementById("login-note");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    note.textContent = t("signingIn");
    note.style.color = "#5C5344";
    try {
      await api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      cachedUser = undefined;
      location.href = getRedirectParam() || "/";
    } catch (e) {
      note.textContent = e.message;
      note.style.color = "#B0532C";
    }
  });
}

function initSignupPage() {
  wireAuthSwitchLink("login-link");
  const form = document.getElementById("signup-form");
  const note = document.getElementById("signup-note");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    note.textContent = t("creatingAccount");
    note.style.color = "#5C5344";
    try {
      await api("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      cachedUser = undefined;
      location.href = getRedirectParam() || "/";
    } catch (e) {
      note.textContent = e.message;
      note.style.color = "#B0532C";
    }
  });
}

function composerFormHtml() {
  return `
    <div class="auth-page composer-page">
      <h1>${t("composer_heading")}</h1>
      <p class="auth-sub">${t("composer_subtitle")}</p>

      <form id="composer-form" class="auth-form composer-form">
        <label>
          ${t("label_title")}
          <input type="text" name="title" required>
        </label>
        <label>
          ${t("label_category")}
          <input type="text" name="category" placeholder="${escapeHtml(t("category_placeholder"))}">
        </label>
        <label>
          ${t("label_tags")}
          <input type="text" name="tags" placeholder="${escapeHtml(t("tags_placeholder"))}">
        </label>
        <label>
          ${t("label_coverImage")}
          <label class="file-btn">
            ${t("chooseImage")}
            <input type="file" id="cover-input" accept="image/*" hidden>
          </label>
          <div id="cover-preview"></div>
        </label>
        <label>
          ${t("label_excerpt")}
          <textarea name="excerpt" placeholder="${escapeHtml(t("excerpt_placeholder"))}"></textarea>
        </label>
        <label>
          ${t("label_body")}
          <textarea name="body" class="composer-body" placeholder="${escapeHtml(t("body_placeholder"))}" required></textarea>
        </label>
        <div class="media-tools">
          <label class="file-btn">
            ${t("insertMediaBtn")}
            <input type="file" id="media-input" accept="image/*,video/*" multiple hidden>
          </label>
          <span class="form-note" id="media-note"></span>
        </div>
        <button type="submit" class="btn btn-dark">${t("publishBtn")}</button>
        <div class="form-note" id="composer-note"></div>
      </form>
    </div>
  `;
}

async function uploadMediaFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Upload failed (${res.status})`);
  }
  return res.json();
}

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const prefix = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
  const insertion = `${prefix}${text}\n\n`;
  textarea.value = before + insertion + after;
  const pos = (before + insertion).length;
  textarea.selectionStart = textarea.selectionEnd = pos;
  textarea.focus();
}

function wireComposerMedia(form) {
  let coverUrl = null;
  const coverInput = document.getElementById("cover-input");
  const coverPreview = document.getElementById("cover-preview");
  coverInput.addEventListener("change", async () => {
    const file = coverInput.files[0];
    if (!file) return;
    coverPreview.textContent = t("uploading");
    try {
      const uploaded = await uploadMediaFile(file);
      coverUrl = uploaded.url;
      coverPreview.innerHTML = `<img src="${uploaded.url}" alt="" class="cover-thumb"> <button type="button" class="link-btn" id="cover-remove">${t("removeBtn")}</button>`;
      document.getElementById("cover-remove").addEventListener("click", () => {
        coverUrl = null;
        coverPreview.innerHTML = "";
        coverInput.value = "";
      });
    } catch (e) {
      coverUrl = null;
      coverPreview.textContent = e.message;
    }
  });

  const mediaInput = document.getElementById("media-input");
  const mediaNote = document.getElementById("media-note");
  const bodyField = form.querySelector('textarea[name="body"]');
  mediaInput.addEventListener("change", async () => {
    const files = [...mediaInput.files];
    for (const file of files) {
      mediaNote.textContent = t("uploadingFile", { name: file.name });
      mediaNote.style.color = "#5C5344";
      try {
        const uploaded = await uploadMediaFile(file);
        insertAtCursor(bodyField, `[[media:${uploaded.url}]]`);
      } catch (e) {
        mediaNote.textContent = e.message;
        mediaNote.style.color = "#B0532C";
        mediaInput.value = "";
        return;
      }
    }
    mediaNote.textContent = t("insertedNote");
    mediaNote.style.color = "#5C5344";
    mediaInput.value = "";
  });

  return () => coverUrl;
}

async function renderNewPostPage() {
  const slot = document.getElementById("composer-slot");
  const user = await getCurrentUser();

  if (!user) {
    slot.innerHTML = `
      <div class="signin-prompt">
        <p>${t("signInToWritePrompt")}</p>
        <a class="btn btn-dark" href="/login.html?redirect=${currentPathForRedirect()}">${t("signInBtn")}</a>
      </div>
    `;
    return;
  }

  slot.innerHTML = composerFormHtml();
  const form = document.getElementById("composer-form");
  const note = document.getElementById("composer-note");
  const getCoverUrl = wireComposerMedia(form);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    note.textContent = t("publishing");
    note.style.color = "#5C5344";
    try {
      const post = await api("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.get("title"),
          category: data.get("category"),
          tags: data.get("tags"),
          excerpt: data.get("excerpt"),
          body: data.get("body"),
          coverUrl: getCoverUrl(),
        }),
      });
      location.href = `/post.html?slug=${encodeURIComponent(post.slug)}`;
    } catch (e) {
      note.textContent = e.message;
      note.style.color = "#B0532C";
    }
  });
}

function accountFormsHtml(user) {
  const langOptions = Object.keys(LANGUAGE_NAMES)
    .map(
      (code) =>
        `<option value="${code}"${user.language === code ? " selected" : ""}>${escapeHtml(LANGUAGE_NAMES[code])}</option>`
    )
    .join("");
  return `
    <div class="auth-page">
      <h1>${t("account_heading")}</h1>
      <p class="auth-sub">${t("account_subtitle")}</p>

      <form id="profile-form" class="auth-form">
        <label>
          ${t("label_name")}
          <input type="text" name="name" required value="${escapeHtml(user.name)}">
        </label>
        <label>
          ${t("label_email")}
          <input type="email" name="email" required value="${escapeHtml(user.email)}">
        </label>
        <button type="submit" class="btn btn-dark">${t("saveProfileBtn")}</button>
        <div class="form-note" id="profile-note"></div>
      </form>

      <hr class="settings-divider">

      <form id="password-form" class="auth-form">
        <label>
          ${t("label_currentPassword")}
          <div class="password-field">
            <input type="password" name="currentPassword" required autocomplete="current-password">
            <button type="button" class="password-toggle" aria-label="${escapeHtml(t("show"))}">${t("show")}</button>
          </div>
        </label>
        <label>
          ${t("label_newPassword")}
          <div class="password-field">
            <input type="password" name="newPassword" required minlength="8" autocomplete="new-password">
            <button type="button" class="password-toggle" aria-label="${escapeHtml(t("show"))}">${t("show")}</button>
          </div>
        </label>
        <label>
          ${t("label_confirmPassword")}
          <div class="password-field">
            <input type="password" name="confirmPassword" required minlength="8" autocomplete="new-password">
            <button type="button" class="password-toggle" aria-label="${escapeHtml(t("show"))}">${t("show")}</button>
          </div>
        </label>
        <button type="submit" class="btn btn-dark">${t("updatePasswordBtn")}</button>
        <div class="form-note" id="password-note"></div>
      </form>

      <hr class="settings-divider">

      <div class="auth-form">
        <label>
          ${t("label_language")}
          <select id="language-select">${langOptions}</select>
        </label>
        <div class="form-note" id="language-note"></div>
      </div>
    </div>
  `;
}

async function renderAccountPage() {
  const slot = document.getElementById("account-slot");
  const user = await getCurrentUser();

  if (!user) {
    slot.innerHTML = `
      <div class="signin-prompt">
        <p>${t("signInToManagePrompt")}</p>
        <a class="btn btn-dark" href="/login.html?redirect=${currentPathForRedirect()}">${t("signInBtn")}</a>
      </div>
    `;
    return;
  }

  slot.innerHTML = accountFormsHtml(user);
  initPasswordToggles(slot);

  const profileForm = document.getElementById("profile-form");
  const profileNote = document.getElementById("profile-note");
  profileForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const data = new FormData(profileForm);
    profileNote.textContent = t("saving");
    profileNote.style.color = "#5C5344";
    try {
      const { user: updated } = await api("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name"), email: data.get("email") }),
      });
      cachedUser = updated;
      profileNote.textContent = t("saved");
      profileNote.style.color = "#3F6B3F";
      initAuthNav();
    } catch (e) {
      profileNote.textContent = e.message;
      profileNote.style.color = "#B0532C";
    }
  });

  const passwordForm = document.getElementById("password-form");
  const passwordNote = document.getElementById("password-note");
  passwordForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const data = new FormData(passwordForm);
    const newPassword = data.get("newPassword");
    const confirmPassword = data.get("confirmPassword");
    if (newPassword !== confirmPassword) {
      passwordNote.textContent = t("passwordsDontMatch");
      passwordNote.style.color = "#B0532C";
      return;
    }
    passwordNote.textContent = t("updating");
    passwordNote.style.color = "#5C5344";
    try {
      await api("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: data.get("currentPassword"), newPassword }),
      });
      passwordNote.textContent = t("passwordUpdated");
      passwordNote.style.color = "#3F6B3F";
      passwordForm.reset();
    } catch (e) {
      passwordNote.textContent = e.message;
      passwordNote.style.color = "#B0532C";
    }
  });

  const langSelect = document.getElementById("language-select");
  const langNote = document.getElementById("language-note");
  langSelect.addEventListener("change", async () => {
    const language = langSelect.value;
    langNote.textContent = t("saving");
    langNote.style.color = "#5C5344";
    try {
      await api("/api/auth/language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      setLang(language);
      cachedUser = null;
      location.reload();
    } catch (e) {
      langNote.textContent = e.message;
      langNote.style.color = "#B0532C";
    }
  });
}
