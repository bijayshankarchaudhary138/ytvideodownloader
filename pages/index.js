import Link from 'next/link';
import { getAllPosts, getRecentPosts, getTrendingPosts, getTotalPostsCount } from '../lib/posts';
import { format, parseISO } from 'date-fns';
import { getCategories } from '../lib/posts';

export default function Home({ latestJobs, results, admitCards, answerKeys, trending, counts, categories }) {
  return (
    <div>
      {/* Hero / Welcome */}
      <div className="bg-white border rounded p-4 mb-6 text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-red-700">Sarkari Result 2026</h1>
        <p className="text-gray-700 mt-2">
          Welcome to India's #1 Education Portal for <strong>Sarkari Result</strong>, Latest Government Jobs, Online Forms, Admit Cards, Results, Answer Keys, Syllabus, Admission and Scholarship updates.
        </p>
        <p className="text-sm text-gray-600 mt-1">
          ✅ Total Jobs Posted: <strong className="text-red-600">{counts.all}+</strong> |
          ⚡ Auto-updates every 1 minute |
          🎯 100% Accurate Information
        </p>
      </div>

      {/* Top Trending / Quick Apply */}
      {trending.length > 0 && (
        <div className="mb-6 border rounded overflow-hidden">
          <div className="category-header">🔥 Trending / Latest Updates</div>
          <ul className="divide-y">
            {trending.map(p => (
              <li key={p.id} className="p-3 hover:bg-red-50 flex justify-between items-center">
                <Link href={`/post/${p.slug}`} className="post-link font-semibold flex-1">
                  🔴 {p.title}
                </Link>
                <span className="text-xs text-gray-500 ml-2 shrink-0">
                  {format(parseISO(p.post_date + 'T00:00:00'), 'dd MMM')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Latest Jobs */}
        <div className="border rounded overflow-hidden">
          <div className="category-header bg-red-600">💼 Latest Jobs / Online Form</div>
          <ul className="divide-y">
            {latestJobs.posts.map(p => (
              <li key={p.id} className="p-2 hover:bg-red-50 flex justify-between items-start gap-2 text-sm">
                <Link href={`/post/${p.slug}`} className="post-link flex-1">
                  {p.title}
                </Link>
                <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">
                  {format(parseISO(p.post_date + 'T00:00:00'), 'dd/MM/yyyy')}
                </span>
              </li>
            ))}
          </ul>
          <div className="bg-gray-100 p-2 text-center text-sm">
            <Link href="/latest-jobs" className="text-red-700 font-bold hover:underline">View More Jobs →</Link>
          </div>
        </div>

        {/* Results */}
        <div className="border rounded overflow-hidden">
          <div className="category-header bg-green-700">📊 Result</div>
          <ul className="divide-y">
            {results.posts.map(p => (
              <li key={p.id} className="p-2 hover:bg-green-50 flex justify-between items-start gap-2 text-sm">
                <Link href={`/post/${p.slug}`} className="post-link flex-1">
                  ✅ {p.title}
                </Link>
                <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">
                  {format(parseISO(p.post_date + 'T00:00:00'), 'dd/MM/yyyy')}
                </span>
              </li>
            ))}
          </ul>
          <div className="bg-gray-100 p-2 text-center text-sm">
            <Link href="/results" className="text-green-700 font-bold hover:underline">View More Results →</Link>
          </div>
        </div>

        {/* Admit Card */}
        <div className="border rounded overflow-hidden">
          <div className="category-header bg-blue-700">🎫 Admit Card</div>
          <ul className="divide-y">
            {admitCards.posts.map(p => (
              <li key={p.id} className="p-2 hover:bg-blue-50 flex justify-between items-start gap-2 text-sm">
                <Link href={`/post/${p.slug}`} className="post-link flex-1">
                  📥 {p.title}
                </Link>
                <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">
                  {format(parseISO(p.post_date + 'T00:00:00'), 'dd/MM/yyyy')}
                </span>
              </li>
            ))}
          </ul>
          <div className="bg-gray-100 p-2 text-center text-sm">
            <Link href="/admit-card" className="text-blue-700 font-bold hover:underline">View More Admit Cards →</Link>
          </div>
        </div>

        {/* Answer Key */}
        <div className="border rounded overflow-hidden">
          <div className="category-header bg-orange-700">🗝️ Answer Key</div>
          <ul className="divide-y">
            {answerKeys.posts.map(p => (
              <li key={p.id} className="p-2 hover:bg-orange-50 flex justify-between items-start gap-2 text-sm">
                <Link href={`/post/${p.slug}`} className="post-link flex-1">
                  📝 {p.title}
                </Link>
                <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">
                  {format(parseISO(p.post_date + 'T00:00:00'), 'dd/MM/yyyy')}
                </span>
              </li>
            ))}
          </ul>
          <div className="bg-gray-100 p-2 text-center text-sm">
            <Link href="/answer-key" className="text-orange-700 font-bold hover:underline">View More Answer Keys →</Link>
          </div>
        </div>
      </div>

      {/* Why Choose Us / SEO Content */}
      <div className="mt-6 bg-white border rounded p-6">
        <h2 className="text-xl font-bold text-red-700 mb-3">About Sarkari Result 2026</h2>
        <p className="text-gray-700 mb-3">
          <strong>Sarkari Result</strong> (SarkariResult) is India's most trusted government job portal that provides latest Sarkari Naukri updates in Hindi and English. We cover all major recruitment bodies including SSC, UPSC, Railway RRB, IBPS, SBI, UPPSC, BPSC, UPSSSC, DSSSB, Army, Navy, Air Force, Police, Teaching jobs, and all state government jobs.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-center text-sm">
          <div className="border p-3 rounded">
            <div className="text-2xl font-bold text-red-600">{counts.jobs}+</div>
            <div className="text-gray-600">Job Notifications</div>
          </div>
          <div className="border p-3 rounded">
            <div className="text-2xl font-bold text-green-600">{counts.results}+</div>
            <div className="text-gray-600">Results Posted</div>
          </div>
          <div className="border p-3 rounded">
            <div className="text-2xl font-bold text-blue-600">{counts.admitcards}+</div>
            <div className="text-gray-600">Admit Cards</div>
          </div>
          <div className="border p-3 rounded">
            <div className="text-2xl font-bold text-orange-600">1 Min</div>
            <div className="text-gray-600">Update Speed</div>
          </div>
        </div>
        <h3 className="text-lg font-bold text-gray-800 mt-6 mb-2">What you will get on Sarkari Result?</h3>
        <ul className="text-gray-700 space-y-1 text-sm list-disc list-inside">
          <li><strong>Latest Govt Jobs 2026:</strong> All central and state government job notifications</li>
          <li><strong>Sarkari Result:</strong> Exam results, merit lists, cut off marks, score cards</li>
          <li><strong>Admit Card:</strong> Download hall tickets, call letters for all exams</li>
          <li><strong>Answer Key:</strong> Official answer keys, objection window links</li>
          <li><strong>Syllabus:</strong> Exam syllabus, pattern, previous year papers</li>
          <li><strong>Admission:</strong> College admissions, entrance exam forms</li>
          <li><strong>Scholarship:</strong> All government scholarship schemes</li>
        </ul>
      </div>
    </div>
  );
}

export async function getServerSideProps() {
  const latestJobs = getAllPosts({ category: 'latest-jobs', limit: 12 });
  const results = getAllPosts({ category: 'results', limit: 10 });
  const admitCards = getAllPosts({ category: 'admit-card', limit: 10 });
  const answerKeys = getAllPosts({ category: 'answer-key', limit: 10 });
  const trending = getTrendingPosts(8);
  const counts = getTotalPostsCount();
  const categories = getCategories();

  return {
    props: {
      latestJobs: JSON.parse(JSON.stringify(latestJobs)),
      results: JSON.parse(JSON.stringify(results)),
      admitCards: JSON.parse(JSON.stringify(admitCards)),
      answerKeys: JSON.parse(JSON.stringify(answerKeys)),
      trending: JSON.parse(JSON.stringify(trending)),
      counts,
      categories
    }
  };
}
