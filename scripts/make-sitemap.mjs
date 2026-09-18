#!/usr/bin/env node
/**
 * Writes web/public/sitemap.xml from the SEO page catalogue, using a placeholder
 * origin that the server rewrites per request (see server/src/seo/render.js).
 * Run after adding a page:  npm run sitemap
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sitemapXml } from '../server/src/seo/render.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'web', 'public', 'sitemap.xml');
await fs.writeFile(target, sitemapXml({ siteUrl: 'https://example.com' }));
console.log('wrote', path.relative(ROOT, target));
