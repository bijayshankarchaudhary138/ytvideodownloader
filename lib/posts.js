import db from './db';
import slugify from 'slugify';
import { format } from 'date-fns';

export function getAllPosts(options = {}) {
  const { category, limit = 50, page = 1, status = 'published', trending } = options;
  const offset = (page - 1) * limit;

  let where = 'WHERE status = ?';
  const params = [status];

  if (category) {
    where += ' AND category = ?';
    params.push(category);
  }
  if (trending) {
    where += ' AND is_trending = 1';
  }

  const count = db.prepare(`SELECT COUNT(*) as total FROM posts ${where}`).get(...params).total;
  const rows = db.prepare(
    `SELECT id, slug, title, short_info, category, post_type, organization, total_post, post_date, update_date, apply_link, notification_pdf, views, is_trending
     FROM posts ${where} ORDER BY datetime(post_date) DESC, id DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  return { posts: rows, pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } };
}

function parseJSONField(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch(e) { return null; }
}

export function getPostBySlug(slug) {
  const post = db.prepare('SELECT * FROM posts WHERE slug = ? AND status = ?').get(slug, 'published');
  if (post) {
    // Increment views
    db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(post.id);
    // Parse JSON fields (handle both strings and objects)
    ['important_dates', 'application_fee', 'age_limit', 'vacancy_details', 'eligibility', 'important_links', 'faqs'].forEach(field => {
      post[field] = parseJSONField(post[field]);
    });
  }
  return post;
}

export function getRecentPosts(limit = 10, category = null) {
  if (category) {
    return db.prepare(
      `SELECT id, slug, title, category, post_date FROM posts WHERE status = 'published' AND category = ? ORDER BY datetime(post_date) DESC, id DESC LIMIT ?`
    ).all(category, limit);
  }
  return db.prepare(
    `SELECT id, slug, title, category, post_date FROM posts WHERE status = 'published' ORDER BY datetime(post_date) DESC, id DESC LIMIT ?`
  ).all(limit);
}

export function getTrendingPosts(limit = 5) {
  return db.prepare(
    `SELECT id, slug, title, category, post_date FROM posts WHERE status = 'published' AND is_trending = 1 ORDER BY datetime(post_date) DESC LIMIT ?`
  ).all(limit);
}

export function getCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
}

export function createPost(data) {
  const slug = data.slug || slugify(data.title.substring(0, 80), { lower: true, strict: true }) + '-' + Date.now().toString().slice(-4);
  const postDate = data.post_date || new Date().toISOString().slice(0, 10);

  const stmt = db.prepare(`
    INSERT INTO posts (
      slug, title, short_info, category, post_type, organization, department, total_post,
      post_date, update_date, important_dates, application_fee, age_limit, vacancy_details,
      eligibility, how_to_apply, important_links, faqs, notification_pdf, apply_link,
      official_website, meta_keywords, meta_description, source_url, source_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const values = [
    slug,
    data.title,
    data.short_info || '',
    data.category || 'latest-jobs',
    data.post_type || 'online_form',
    data.organization || '',
    data.department || '',
    data.total_post || '',
    postDate,
    data.update_date || postDate,
    JSON.stringify(data.important_dates || {}),
    JSON.stringify(data.application_fee || {}),
    JSON.stringify(data.age_limit || {}),
    JSON.stringify(data.vacancy_details || []),
    JSON.stringify(data.eligibility || {}),
    data.how_to_apply || '',
    JSON.stringify(data.important_links || {}),
    JSON.stringify(data.faqs || []),
    data.notification_pdf || '',
    data.apply_link || '',
    data.official_website || '',
    data.meta_keywords || '',
    data.meta_description || '',
    data.source_url || '',
    data.source_name || ''
  ];

  const result = stmt.run(...values);
  return { id: result.lastInsertRowid, slug };
}

export function updatePost(id, data) {
  const fields = [];
  const values = [];
  const allowed = [
    'title', 'short_info', 'category', 'post_type', 'organization', 'department', 'total_post',
    'post_date', 'update_date', 'important_dates', 'application_fee', 'age_limit', 'vacancy_details',
    'eligibility', 'how_to_apply', 'important_links', 'faqs', 'notification_pdf', 'apply_link',
    'official_website', 'status', 'is_trending', 'meta_keywords', 'meta_description'
  ];

  allowed.forEach(key => {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      if (['important_dates', 'application_fee', 'age_limit', 'vacancy_details', 'eligibility', 'important_links', 'faqs'].includes(key)) {
        values.push(typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]));
      } else {
        values.push(data[key]);
      }
    }
  });

  values.push(id);
  return db.prepare(`UPDATE posts SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
}

export function deletePost(id) {
  return db.prepare('DELETE FROM posts WHERE id = ?').run(id);
}

export function searchPosts(query, limit = 20) {
  return db.prepare(
    `SELECT id, slug, title, short_info, category, post_date FROM posts
     WHERE status = 'published' AND (title LIKE ? OR short_info LIKE ? OR meta_keywords LIKE ?)
     ORDER BY datetime(post_date) DESC LIMIT ?`
  ).all(`%${query}%`, `%${query}%`, `%${query}%`, limit);
}

export function getTotalPostsCount() {
  return {
    all: db.prepare("SELECT COUNT(*) as c FROM posts WHERE status='published'").get().c,
    jobs: db.prepare("SELECT COUNT(*) as c FROM posts WHERE status='published' AND category='latest-jobs'").get().c,
    results: db.prepare("SELECT COUNT(*) as c FROM posts WHERE status='published' AND category='results'").get().c,
    admitcards: db.prepare("SELECT COUNT(*) as c FROM posts WHERE status='published' AND category='admit-card'").get().c,
  };
}
