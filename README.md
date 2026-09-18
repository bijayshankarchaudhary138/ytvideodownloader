# 🔴 Sarkari Result Clone - Auto-Posting Government Job Portal

A complete, production-ready SarkariResult.com clone with **automatic 1-minute posting** from official government websites. When BPSC, SSC, UPSC, Railway, IBPS, or any official site releases a new job/result/admit card, this website automatically generates a fully formatted blog post within 1 minute.

## ✨ Features

### 🤖 Auto-Posting System (Key Feature)
- **Scrapes 15+ official websites EVERY 1 MINUTE**
- Sources monitored: SSC, UPSC, IBPS, Railway RRB, BPSC, UPPSC, UPSSSC, RPSC, DSSSB, SBI, Army, Navy, NTA, CBSE, MPESB, HPSC
- When new notification found → automatically creates SEO-optimized post in exact SarkariResult.com format
- Posts go live within ~1 minute of official release
- Auto-detects post type: Online Form / Result / Admit Card / Answer Key
- De-duplication prevents duplicate posts
- Auto-generates: Important Dates, Application Fee, Age Limit, Vacancy Table, How to Apply, Important Links, FAQs

### 📝 Blog Post Format (Exact Sarkari Result Style)
Each post is professionally formatted like sarkariresult.com:
- Post header table (Name of Post, Post Date, Short Information)
- Social share buttons (Telegram, WhatsApp, Instagram)
- Important Dates table
- Application Fee table
- Age Limit section
- Vacancy Details table (Post Name, Total Post, Eligibility)
- How to Fill instructions
- Important Links table (Apply Online, Download Notification, Official Website)
- 7+ Auto-generated FAQs
- Structured data JSON-LD for Google rich snippets

### 🚀 SEO Optimized for #1 Google Ranking
- **Server-side rendered** (Next.js) for fast indexing
- Complete meta tags (title, description, keywords, OG tags)
- **Schema.org JobPosting / Article JSON-LD** structured data
- Automatic XML sitemap (`/sitemap.xml`)
- robots.txt
- Search Action schema for Google search box
- Canonical URLs
- SEO-friendly slug generation
- Breadcrumb navigation
- Interlinking between posts (sidebar shows latest posts)
- India locale (`en_IN`) targeting
- Proper heading hierarchy (H1, H2, H3)

### 🎯 Categories Covered
- 💼 **Latest Jobs** - Online forms, recruitment notifications
- 📊 **Results** - Exam results, merit lists, cut offs
- 🎫 **Admit Card** - Hall tickets, call letters
- 🗝️ **Answer Key** - Official answer keys
- 📚 **Syllabus** - Exam syllabus and pattern
- 🎓 **Admission** - College admissions
- 💰 **Scholarship** - Scholarship forms

### 👨‍💼 Admin Panel
- **URL**: `/admin/login` (default: admin / admin123)
- 1-Click Quick Post: just paste title + URL → system auto-generates full formatted post
- Manual "Run Scraper" button to trigger immediate check
- Mark posts as Trending (shows on homepage)
- View/delete posts
- Post count statistics

### 🎨 Frontend Design (SarkariResult-style)
- Red header (matching sarkariresult.com color scheme)
- Yellow ticker with latest updates
- Quick Links navigation grid
- 4-section homepage (Jobs, Results, Admit Cards, Answer Keys)
- Sidebar with latest posts and social links
- Pagination on category pages
- Trending posts section
- Search functionality (`/search`)
- Mobile responsive (Tailwind CSS)
- Advertisement slots ready

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Seed sample data (18 demo posts)
npm run seed

# Start website in development
npm run dev
# Visit http://localhost:3000

# Start auto-scraper in separate terminal (checks every 1 minute!)
npm run scraper

# Build for production
npm run build
npm start
```

## 📁 Project Structure

```
├── pages/                    # Next.js pages
│   ├── index.js              # Homepage
│   ├── [category].js         # Category pages (latest-jobs, results, etc.)
│   ├── post/[slug].js        # Individual post page
│   ├── search.js             # Search page
│   ├── admin/index.js        # Admin dashboard
│   ├── admin/login.js        # Admin login
│   ├── sitemap.xml.js        # Auto-generated sitemap
│   └── api/                  # API routes
│       ├── admin/            # Admin APIs (create posts, run scraper)
│       ├── posts.js          # Public posts API
│       └── search.js         # Search API
├── components/
│   ├── Layout.js             # Header/Footer/Sidebar
│   └── PostView.js           # SarkariResult-style post template
├── lib/
│   ├── db.js                 # JSON database (no native dependencies)
│   ├── posts.js              # Post CRUD operations
│   ├── contentGenerator.js   # Generates SarkariResult format content
│   └── auth.js               # Admin authentication (JWT)
├── scraper/
│   ├── index.cjs             # Scraper logic (monitors 15+ official sites)
│   ├── cron.cjs              # Cron scheduler (runs every 1 minute)
│   └── lib/
│       ├── db.cjs            # DB for scraper
│       └── contentGenerator.cjs  # Content generator for scraper
├── scripts/
│   └── seed.cjs              # Sample data seeder
├── styles/globals.css        # SarkariResult-style CSS
└── data/db.json              # SQLite-free JSON database
```

## 🔧 How Auto-Posting Works

1. Cron job runs every **60 seconds**
2. For each official source (SSC, BPSC, etc.):
   - Fetches the notification page
   - Extracts all PDF/notification links using Cheerio
   - Filters for relevant notifications (recruitment, result, admit card keywords)
   - Compares URLs against existing posts (dedup)
   - If new notification found:
     - Auto-detects category (job/result/admit-card/answer-key)
     - Generates title in SarkariResult format (e.g., "BPSC 70th CCE Online Form 2026")
     - Auto-generates SEO meta keywords and description
     - Creates full post with dates, fee, age limit, vacancy, how-to-apply, important links, FAQs
     - Marks as trending for homepage
     - Saves to database and instantly live on website

3. Google/bing crawls immediately due to server-rendered pages + sitemap updates

## 📈 Tips for Top Google Ranking

1. **Add your real domain** in `next.config.js`, `sitemap.xml.js`, and `components/Layout.js` (currently using `sarkariresult.example.com`)
2. **Keep scraper running 24/7** (`npm run scraper` or use PM2 for production)
3. **Submit sitemap** to Google Search Console (`/sitemap.xml`)
4. **Change admin password** immediately (default: admin/admin123)
5. **Add Google Analytics / Search Console**
6. **Connect custom domain with SSL**
7. **Add real social media links** (Telegram, WhatsApp, Instagram)
8. **Submit to Google News** for instant indexing
9. **Add Telegram bot** to push notifications to subscribers (extendable)
10. **Monetize** with AdSense (ad slots already in layout)

## 🔐 Admin Credentials (CHANGE IN PRODUCTION!)

- **URL**: `/admin/login`
- **Username**: `admin`
- **Password**: `admin123`

To change password, update the admin row in `data/db.json` (bcrypt hash) or add a new admin via the admin panel.

## 🛠️ Production Deployment

```bash
npm run build
npm start          # Website on port 3000
npm run scraper    # Run scraper in background (use PM2)

# Using PM2 for production:
npm install -g pm2
pm2 start npm --name "sarkari-site" -- start
pm2 start npm --name "sarkari-scraper" -- run scraper
pm2 save
pm2 startup
```

## 📋 Adding More Sources

To add more official websites to monitor, edit `scraper/index.cjs` and add to the `SOURCES` array:

```js
{
  name: 'Source Name',
  url: 'https://official-website.gov.in/notifications',
  selectors: ['a[href*=".pdf"]', '.notification a'],  // CSS selectors for links
  officialWebsite: 'https://official-website.gov.in'
}
```

The scraper will automatically start monitoring the new source on next cycle.

## ⚠️ Disclaimer

This website aggregates information from official government sources. Always verify information with the official website before applying. This is not affiliated with sarkariresult.com - it's a custom-built alternative with auto-posting capability.
