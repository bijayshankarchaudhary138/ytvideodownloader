# "yt video downloader" me rank kaise karein — sach + plan

## Pehle sach (important, warna time waste hoga)

"yt video downloader" / "youtube video downloader" jaise keywords **bahut**
competitive hain — y2mate, SaveFrom, SSYouTube jaise sites ke paas lakhon
backlinks aur saal-on-saal ki authority hai. Sirf website bana dene se **rank #1
nahi aata**. Ye ek 3–9 mahine ka content + backlinks ka kaam hai.

Do cheezein aur jaan lo:

1. Google in sites ko regular interval me **de-index** karta hai (DMCA/copyright
   complaints ke kaaran). Isliye aaj rank 1 wali site bhi kal gayab ho sakti hai —
   jo tumhare liye mauka hai, kyunki tumhara app **self-hostable + ad-free** hai.
2. Google apne aap decide karta hai kis page ko rank dena hai. Isliye "video
   downloader" jaisa **general** keyword chhod kar, pehle **long-tail** keywords
   pakdo (neeche list hai) — 3-6 mahine me traffic aata hai, phir general keyword
   pe chance banta hai.

**Realistic target:**

| Timeline | Target |
| --- | --- |
| Week 1–2 | Google Search Console me index, apne domain ka naam search karne pe #1 |
| Month 1–3 | "download youtube video 1080p without ads", "youtube playlist downloader zip", "youtube mp3 downloader 320kbps" — page 2–3 |
| Month 3–9 | Main keyword "youtube video downloader" → page 1 (top 3 mushkil, par possible) |

---

## Part 1 — Jo already ho chuka hai (code me)

Ranking ke liye jo technical cheezein zaroori hoti hain, wo app me built-in hain:

- ✅ **Crawlable content** — JS ke bina bhi pura page (H1, 6+ H2, 8+ H3, formats
  table, 8 FAQs, Hindi section). Thin pages rank nahi karte, isliye content
  page me hi hai.
- ✅ **Structured data (rich results)** — WebApplication (price 0), HowTo, FAQPage
  (8 questions — Google search me "People also ask" me aa sakta hai),
  BreadcrumbList. Koi fake `aggregateRating` nahi (Google us par penalty deta hai).
- ✅ **Canonical + hreflang** (en / hi / x-default) — Hindi searchers ke liye alag
  signal, per-request real origin ke saath.
- ✅ **Title + meta description** (keyword-focused, length-checked).
- ✅ **Open Graph + Twitter cards** — WhatsApp/Twitter pe share karne par proper
  preview (backlinks aise hi milte hain).
- ✅ **robots.txt + sitemap.xml** (per-request sahi domain ke saath).
- ✅ **Speed** — poora frontend ~200 KB, LCP-friendly, PWA + service worker.
- ✅ **Mobile-first** — Google mobile-first index karta hai.
- ✅ **HTTPS-ready + security headers**.
- ✅ **Google/Bing verification meta** — env se inject hota hai (Part 3 dekho).

## Part 2 — Google pe index karana (5 steps, 30 minute)

1. **Domain le lo** (₹700–900/saal) — Hostinger/Namecheap/GoDaddy. Free
   `onrender.com` subdomain se rank karna mushkil hai; apna domain zaroori hai.
   `.com` best, `.in`/`.app` bhi theek.
2. **Deploy + domain connect karo** — `docs/GO-LIVE-FREE.md` (Render blueprint) ya
   `docs/DEPLOY.md` (VPS). Domain ko site pe point karo, HTTPS on karo.
3. **`SITE_URL` set karo** — `SITE_URL=https://your-domain.com`. Isse canonical,
   OG aur sitemap sab tumhare domain ke ho jayenge (warna placeholder ki jagah
   request origin use hota hai — kaam karta hai, par explicit better hai).
4. **Google Search Console** (`search.google.com/search-console`):
   - Add property → **URL prefix** → `https://your-domain.com`
   - Verify: **HTML tag** method → jo `content="..."` mile, use env me daalo:
     `GOOGLE_SITE_VERIFICATION=wo_token` → redeploy → Verify dabao.
     (Bing ke liye: `BING_SITE_VERIFICATION=...`, meta name `msvalidate.01`.)
   - **Sitemaps** → `https://your-domain.com/sitemap.xml` submit karo.
   - **URL inspection** → homepage URL daal kar **Request indexing**.
5. **Bing Webmaster Tools** me bhi same karo (Bing/Yahoo/DuckDuckGo traffic free
   milta hai, competition kam). Google Search Console se import kar sakte ho.

1–3 din me index ho jata hai. Uske baad **har hafte GSC → Performance** dekho:
kis query pe impressions aa rahe hain, wahi keywords content me badhao.

## Part 3 — Ranking plan (90-din)

### A. Keywords — pehle long-tail (jeetne layak), phir general

| Priority | Keyword | Page |
| --- | --- | --- |
| 1 | download youtube video 1080p with audio | `/` (already covered) |
| 2 | youtube playlist downloader zip | `/` + `/how-to` |
| 3 | youtube mp3 downloader 320 kbps | `/` + `/how-to` |
| 4 | youtube video downloader without ads | `/` |
| 5 | youtube video download kaise kare | `/` Hindi section (hreflang hi) |
| 6 | youtube shorts downloader | naya section (Shorts ka zikr hai) |
| 7 | youtube video downloader api free | `/api-docs` |
| 8 | self hosted youtube downloader | README + `/faq` |
| 9 | youtube video downloader (general) | baad me, jab authority aaye |

Rule: **ek page = ek intent**. `/` = download karna, `/how-to` = step-by-step,
`/faq` = doubts, `/api-docs` = developers. Keyword stuffing na karo — Google
penalise karta hai; natural Hindi + English dono likho.

### B. Content — har hafte 1 page (yehi asli ranking karta hai)

Naye pages banao (SPA routes already hain, content badha do):

1. `/how-to` — "YouTube video download kaise kare (Android, iPhone, PC)" — screenshots ke saath
2. `/faq` — 20+ sawaal (legal, quality, speed, playlist, subtitles, error messages)
3. `/youtube-shorts-downloader` — Shorts ke liye dedicated page
4. `/youtube-playlist-downloader` — playlist + ZIP
5. `/youtube-mp3-downloader` — audio formats, 320 kbps
6. `/youtube-to-mp4-1080p` — quality guide
7. Blog: "Why most YouTube downloaders give you silent 1080p videos" (technical story — backlinks aise milte hain)

Har page: **unique title + description**, ek H1, chhote paragraphs, ek table ya
list, internal links, aur page ke end me FAQ (schema ke saath).

### C. Backlinks (rank ke liye zaroori)

- **GitHub repo** — README me live demo link do (tumhara repo already public hai)
- Reddit: r/youtubedl, r/selfhosted, r/DataHoarder, r/opensource — "I built an
  ad-free self-hosted downloader" post (rules padho, spam na karo)
- Hacker News "Show HN", Lobsters, Product Hunt
- awesome-selfhosted list me PR (self-hosted app ka criteria match karta hai)
- Dev.to / Hashnode par technical write-up (ffmpeg muxing, SSE progress)
- YouTube par 2-min demo video (description me link)

Ye 10–20 **asli** backlinks kisi bhi 1000 spam directory se better hain.

### D. Technical hygiene (already done, par check karte raho)

- GSC me **Core Web Vitals** green rakho (bundle chhota hai, isliye aasan)
- Sitemap me naye pages add karo (`web/public/sitemap.xml`)
- 404 pages ko proper status code do (app karta hai)
- Duplicate content na ho — canonical already set hai
- **Legal pages** rakho (`/privacy`, `/terms`) — E-E-A-T signal + AdSense/legal safety
- Site slow na ho — Render free sleep karta hai, isliye domain + VPS better hai
  (crawler ko 60 second wait pasand nahi)

### E. Jo NAHI karna hai

- ❌ Fake reviews / `aggregateRating` markup (manual penalty)
- ❌ Keyword spam ya chhupa hua text
- ❌ Copy-paste competitor content
- ❌ Clickbait "fast download" popups — tumhara differentiator hi ad-free hona hai
- ❌ Paid backlink packages (₹500 me 1000 links) — Google pakad leta hai

## Part 4 — Har hafte ka 1 ghanta routine

1. GSC → Performance: top queries dekho (10 min)
2. Ek naya content page likho ya purana update karo (30 min)
3. Ek jagah share karo (Reddit/HN/Dev.to/tumhara YouTube) (10 min)
4. `/api/health` + GSC coverage errors check karo (5 min)
5. yt-dlp update: `SKIP_FFMPEG=1 npm run setup` (5 min — YouTube badalta rehta hai)

## Part 5 — Checklist (go-live ke din)

- [ ] Apna domain + HTTPS live
- [ ] `SITE_URL=https://your-domain.com` set
- [ ] `DEMO_MODE=off`
- [ ] `GOOGLE_SITE_VERIFICATION` + `BING_SITE_VERIFICATION` set
- [ ] GSC me property verify + sitemap submit + homepage "Request indexing"
- [ ] Bing Webmaster Tools me same
- [ ] `/robots.txt` aur `/sitemap.xml` browser me kholke check karo (sahi domain dikhe)
- [ ] `view-source:` me JSON-LD dikh raha hai
- [ ] Mobile pe kholke download test karo
- [ ] `/privacy` + `/terms` pages bhar do (legal)
- [ ] GitHub README me live demo link
- [ ] 3–5 communities me genuinely share karo

---

**Ek line me:** code aur SEO technical sab ready hai — ab tumhe **domain + GSC +
weekly content + backlinks** karna hai. Rank #1 possible hai, par 3–9 mahine ki
mehnat ke baad, aur wo bhi shayad pehle long-tail keywords me.
