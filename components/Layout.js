import Head from 'next/head';
import Link from 'next/link';
import { getRecentPosts, getCategories } from '../lib/posts';
import { formatDistanceToNow } from 'date-fns';
import { format, parseISO } from 'date-fns';

export default function Layout({ children, title, description, keywords, post }) {
  const recentPosts = getRecentPosts(8);
  const categories = getCategories();

  const siteTitle = title ? `${title} | Sarkari Result 2026` : 'Sarkari Result 2026 - Latest Govt Jobs, Results, Admit Card Online';
  const siteDesc = description || 'Sarkari Result 2026: Get Latest Sarkari Result, Govt Jobs, Sarkari Exam Results, Admit Card, Answer Key, Syllabus, Online Form, Admission, Scholarship at one place.';
  const siteKeywords = keywords || 'Sarkari Result, SarkariResult, Latest Govt Jobs, Sarkari Exam, Online Form, Admit Card, Result, Answer Key, Sarkari Job 2026, Government Jobs, sarkariresult.com, Rojgar Result';

  return (
    <>
      <Head>
        <title>{siteTitle}</title>
        <meta name="description" content={siteDesc} />
        <meta name="keywords" content={siteKeywords} />
        <meta property="og:title" content={siteTitle} />
        <meta property="og:description" content={siteDesc} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en_IN" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href={`https://sarkariresult.example.com${post ? `/post/${post.slug}` : ''}`} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Sarkari Result",
            "url": "/",
            "potentialAction": {
              "@type": "SearchAction",
              "target": "/search?q={search_term_string}",
              "query-input": "required name=search_term_string"
            }
          })
        }} />
      </Head>

      <div className="min-h-screen">
        {/* Top Bar */}
        <div className="bg-red-700 text-white text-sm py-1 px-4">
          <div className="max-w-6xl mx-auto flex flex-wrap justify-between items-center gap-2">
            <div className="flex gap-3">
              <Link href="/" className="hover:underline">Home</Link>
              <span>|</span>
              <Link href="/latest-jobs" className="hover:underline">Latest Jobs</Link>
              <span>|</span>
              <Link href="/results" className="hover:underline">Results</Link>
              <span>|</span>
              <Link href="/admit-card" className="hover:underline">Admit Card</Link>
              <span>|</span>
              <Link href="/answer-key" className="hover:underline">Answer Key</Link>
            </div>
            <div className="text-xs">
              🇮🇳 India's #1 Trusted Sarkari Result Portal
            </div>
          </div>
        </div>

        {/* Header */}
        <header className="bg-red-600 text-white py-4 shadow-md">
          <div className="max-w-6xl mx-auto px-4 text-center">
            <Link href="/" className="inline-block">
              <h1 className="text-3xl md:text-4xl font-bold tracking-wide">
                🔴 SARKARI RESULT
              </h1>
              <p className="text-sm mt-1 text-red-100">
                SarkariResult.com 2026 | Latest Govt Jobs | Results | Admit Cards | Online Form
              </p>
            </Link>
          </div>
        </header>

        {/* Ticker */}
        <div className="bg-yellow-400 text-black py-2 overflow-hidden">
          <div className="max-w-6xl mx-auto px-4 flex items-center">
            <span className="bg-red-600 text-white px-3 py-1 text-sm font-bold shrink-0 mr-3">
              ⚡ NEW UPDATES
            </span>
            <div className="overflow-hidden flex-1">
              <div className="marquee">
                {recentPosts.slice(0, 5).map((p, i) => (
                  <Link key={p.id} href={`/post/${p.slug}`} className="mx-4 text-sm font-semibold hover:text-red-700">
                    {i > 0 && ' • '}{p.title}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Links Grid */}
        <div className="bg-gray-100 border-b">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div className="grid grid-cols-3 md:grid-cols-7 gap-2 quick-link-grid text-xs md:text-sm">
              {categories.map(cat => (
                <Link key={cat.id} href={`/${cat.slug}`}>{cat.name}</Link>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              {children}
            </div>

            {/* Sidebar */}
            <aside className="lg:col-span-1">
              <div className="ad-box mb-4">
                <p className="text-gray-500 text-xs">Advertisement</p>
                <p className="text-lg font-bold text-gray-400 my-8">300x250 Ad Space</p>
              </div>

              <div className="border rounded mb-4">
                <div className="category-header">🔥 Latest Updates</div>
                <ul className="divide-y">
                  {recentPosts.map(p => (
                    <li key={p.id} className="p-2 text-sm hover:bg-red-50">
                      <Link href={`/post/${p.slug}`} className="post-link block">
                        {p.title}
                        <div className="text-xs text-gray-500 mt-1">
                          {format(parseISO(p.post_date + 'T00:00:00'), 'dd MMM yyyy')}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border rounded mb-4">
                <div className="category-header">📱 Join Us</div>
                <div className="p-3 space-y-2 text-sm">
                  <a href="#" className="flex items-center gap-2 text-blue-600 hover:underline">
                    <span className="w-6 h-6 bg-blue-500 text-white rounded flex items-center justify-center text-xs">T</span>
                    Telegram Channel
                  </a>
                  <a href="#" className="flex items-center gap-2 text-green-600 hover:underline">
                    <span className="w-6 h-6 bg-green-500 text-white rounded flex items-center justify-center text-xs">W</span>
                    WhatsApp Group
                  </a>
                  <a href="#" className="flex items-center gap-2 text-pink-600 hover:underline">
                    <span className="w-6 h-6 bg-pink-500 text-white rounded flex items-center justify-center text-xs">I</span>
                    Instagram
                  </a>
                </div>
              </div>

              <div className="ad-box">
                <p className="text-gray-500 text-xs">Advertisement</p>
                <p className="text-lg font-bold text-gray-400 my-8">160x600 Ad Space</p>
              </div>
            </aside>
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-gray-900 text-white mt-8">
          <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
              <div>
                <h3 className="font-bold text-red-400 mb-3">Quick Links</h3>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li><Link href="/" className="hover:text-white">Home</Link></li>
                  <li><Link href="/latest-jobs" className="hover:text-white">Latest Jobs</Link></li>
                  <li><Link href="/results" className="hover:text-white">Results</Link></li>
                  <li><Link href="/admit-card" className="hover:text-white">Admit Card</Link></li>
                  <li><Link href="/answer-key" className="hover:text-white">Answer Key</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-red-400 mb-3">Candidates</h3>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li><Link href="/syllabus" className="hover:text-white">Syllabus</Link></li>
                  <li><Link href="/admission" className="hover:text-white">Admission</Link></li>
                  <li><Link href="/scholarship" className="hover:text-white">Scholarship</Link></li>
                  <li><Link href="/search" className="hover:text-white">Search</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-red-400 mb-3">Exams</h3>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li>SSC</li>
                  <li>UPSC</li>
                  <li>Railway RRB</li>
                  <li>Banking (IBPS/SBI)</li>
                  <li>State PSCs</li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-red-400 mb-3">About</h3>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li><Link href="/about" className="hover:text-white">About Us</Link></li>
                  <li><Link href="/privacy" className="hover:text-white">Privacy Policy</Link></li>
                  <li><Link href="/disclaimer" className="hover:text-white">Disclaimer</Link></li>
                  <li><Link href="/contact" className="hover:text-white">Contact Us</Link></li>
                  <li><Link href="/admin/login" className="hover:text-white">Admin</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-gray-700 pt-4 text-center text-sm text-gray-400">
              <p>© {new Date().getFullYear()} Sarkari Result - All Rights Reserved.</p>
              <p className="mt-1 text-xs">Disclaimer: This is not an official website. We collect information from various official sources and publish it here for easy access. Always verify details with the official website.</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
