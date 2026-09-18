import { getAllPosts, getCategories } from '../lib/posts';

export default function Sitemap() {}

export async function getServerSideProps({ res }) {
  const base = 'https://sarkariresult.example.com';
  const { posts } = getAllPosts({ limit: 5000 });
  const categories = getCategories();

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  xml += `  <url><loc>${base}/</loc><changefreq>always</changefreq><priority>1.0</priority></url>\n`;
  categories.forEach(c => {
    xml += `  <url><loc>${base}/${c.slug}</loc><changefreq>hourly</changefreq><priority>0.9</priority></url>\n`;
  });

  posts.forEach(p => {
    xml += `  <url><loc>${base}/post/${p.slug}</loc><lastmod>${p.post_date}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
  });

  xml += '</urlset>';

  res.setHeader('Content-Type', 'application/xml');
  res.write(xml);
  res.end();

  return { props: {} };
}
