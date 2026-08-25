'use strict';

/**
 * Shared content generation for the site tooling.
 *
 * Both the terminal tool (manage.js) and the browser composer (dev-server.js)
 * emit the same markup, so the escaping policy and the post template live here
 * instead of being written twice and drifting apart.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

/**
 * Escaping policy for generated markup:
 *   - Short structured fields (titles, names, tags, captions, dates, alt text) are
 *     escaped, so an ampersand or angle bracket can't break the page.
 *   - Long prose fields (blog body, project description, flight outcome) are left
 *     raw on purpose, so you can still write <strong> or a link inline.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Strip anything that isn't a safe filename character. Prevents a typed slug like
// "../../secrets" from writing outside the blog directory.
function sanitizeSlug(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function formatDateLong(dateStr) {
  // Parses YYYY-MM-DD and returns "Month DD, YYYY"
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const year = parts[0];
  const month = months[parseInt(parts[1], 10) - 1] || parts[1];
  const day = parseInt(parts[2], 10);
  return `${month} ${day}, ${year}`;
}

const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap';

// A blank line starts a new paragraph; single newlines inside a block are joined,
// so you can hard-wrap while typing without it becoming three paragraphs.
function splitParagraphs(body) {
  return String(body)
    .split(/\n\s*\n/)
    .map(block => block.split('\n').map(line => line.trim()).filter(Boolean).join(' '))
    .filter(Boolean);
}

function buildPostHtml({ title, date, paragraphs }) {
  const safeTitle = escapeHtml(title);
  const summary = paragraphs[0].replace(/<[^>]*>/g, '').slice(0, 160);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle} — Aidan Yu</title>
    <meta name="description" content="${escapeAttr(summary)}" />
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeAttr(title)}" />
    <meta property="og:description" content="${escapeAttr(summary)}" />
    <meta name="twitter:card" content="summary" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="${FONTS_HREF}" />
    <link rel="stylesheet" href="../styles.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="site-title" href="../index.html">aidan yu</a>
      <nav aria-label="Primary">
        <ul class="nav">
          <li><a href="../index.html">home</a></li>
          <li><a href="../blog.html" aria-current="page">blog</a></li>
          <li><a href="../projects.html">projects</a></li>
          <li><a href="../rockets.html">rockets</a></li>
          <li><a href="../photography.html">photography</a></li>
        </ul>
      </nav>
    </header>

    <main>
      <a class="back-link" href="../blog.html">← back to blog</a>
      <h1 class="page-title">${safeTitle.toLowerCase()}</h1>
      <div class="post-meta">Published: ${escapeHtml(formatDateLong(date))}</div>

      <article>
        ${paragraphs.map(p => `<p>${p}</p>`).join('\n        ')}
      </article>
    </main>
  </body>
</html>
`;
}

/**
 * Writes blog/<slug>.html and adds the entry to the top of the list in blog.html.
 *
 * Returns { slug, file, created }. Throws on bad input or a refused overwrite, so
 * callers surface one failure path rather than parsing console output.
 */
function createPost({ title, date, body, slug, overwrite = false }) {
  if (!String(title || '').trim()) throw new Error('Title cannot be empty.');

  const finalSlug = sanitizeSlug(slug || title);
  if (!finalSlug) throw new Error('Slug could not be derived from that title. Please supply one.');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    throw new Error('Date must be YYYY-MM-DD.');
  }

  const paragraphs = splitParagraphs(body);
  if (paragraphs.length === 0) throw new Error('Post cannot be empty.');

  const blogDir = path.join(ROOT, 'blog');
  if (!fs.existsSync(blogDir)) fs.mkdirSync(blogDir);

  const postFilePath = path.join(blogDir, `${finalSlug}.html`);
  const existed = fs.existsSync(postFilePath);
  if (existed && !overwrite) {
    throw new Error(`blog/${finalSlug}.html already exists. Choose a different slug or confirm overwrite.`);
  }

  fs.writeFileSync(postFilePath, buildPostHtml({ title, date, paragraphs }), 'utf8');

  // Only add a list entry for a genuinely new post. Overwriting an existing post
  // must not append a second link to the same file.
  if (!existed) addPostToIndex({ title, date, slug: finalSlug });

  return { slug: finalSlug, file: `blog/${finalSlug}.html`, created: !existed };
}

function addPostToIndex({ title, date, slug }) {
  const blogHtmlPath = path.join(ROOT, 'blog.html');
  if (!fs.existsSync(blogHtmlPath)) throw new Error('blog.html not found.');

  let blogHtml = fs.readFileSync(blogHtmlPath, 'utf8');
  const listTag = '<ul class="blog-list">';
  const listIndex = blogHtml.indexOf(listTag);
  if (listIndex === -1) {
    throw new Error('Could not find <ul class="blog-list"> in blog.html. Add the link manually.');
  }

  const insertionPoint = listIndex + listTag.length;
  const newEntry = `\n        <li class="blog-item">
          <span class="blog-date">${escapeHtml(date)}</span>
          <a class="blog-link" href="blog/${slug}.html">${escapeHtml(title)}</a>
        </li>`;

  fs.writeFileSync(blogHtmlPath, blogHtml.slice(0, insertionPoint) + newEntry + blogHtml.slice(insertionPoint), 'utf8');
}

module.exports = {
  ROOT,
  FONTS_HREF,
  escapeHtml,
  escapeAttr,
  sanitizeSlug,
  formatDateLong,
  splitParagraphs,
  buildPostHtml,
  createPost,
  addPostToIndex,
};
