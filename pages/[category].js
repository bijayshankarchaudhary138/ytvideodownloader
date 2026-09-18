import Link from 'next/link';
import { getAllPosts, getCategories } from '../lib/posts';
import { format, parseISO } from 'date-fns';

const CATEGORY_META = {
  'latest-jobs': { title: 'Latest Sarkari Jobs 2026 | Online Form', color: 'red', desc: 'Get latest Sarkari Naukri, government job notifications, online form 2026. Apply online for all latest govt jobs in India.' },
  'results': { title: 'Sarkari Result 2026 | All Exam Results', color: 'green', desc: 'Check latest Sarkari Result, exam results, merit list, cut off marks, score cards for all government exams.' },
  'admit-card': { title: 'Admit Card 2026 | Download Hall Ticket', color: 'blue', desc: 'Download latest admit cards, hall tickets, call letters for all Sarkari exams.' },
  'answer-key': { title: 'Answer Key 2026 | Official Answer Sheet', color: 'orange', desc: 'Download official answer keys for all Sarkari exams. Check objection window dates.' },
  'syllabus': { title: 'Syllabus 2026 | Exam Pattern', color: 'purple', desc: 'Download exam syllabus, pattern, previous year papers for all government exams.' },
  'admission': { title: 'Admission Form 2026 | College Admissions', color: 'teal', desc: 'Check latest admission forms, entrance exams for colleges and universities in India.' },
  'scholarship': { title: 'Scholarship Form 2026 | Government Scholarships', color: 'gray', desc: 'Apply for government scholarships for students in India. Check eligibility, last date, apply online.' }
};

export default function CategoryPage({ posts, category, pagination, categoryInfo }) {
  return (
    <div>
      <div className="bg-white border rounded p-4 mb-4">
        <h1 className="text-2xl font-bold text-red-700">{categoryInfo.title}</h1>
        <p className="text-gray-600 mt-2">{categoryInfo.desc}</p>
      </div>

      <div className="bg-white border rounded overflow-hidden">
        <ul className="divide-y">
          {posts.map(p => (
            <li key={p.id} className="p-3 hover:bg-red-50">
              <Link href={`/post/${p.slug}`} className="post-link font-semibold block">
                <span className={p.is_trending ? 'text-red-700' : ''}>
                  {p.is_trending && '🔴 '}{p.title}
                </span>
              </Link>
              {p.short_info && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{p.short_info.substring(0, 200)}...</p>}
              <div className="text-xs text-gray-500 mt-2 flex gap-3">
                <span>📅 Posted: {format(parseISO(p.post_date + 'T00:00:00'), 'dd MMMM yyyy')}</span>
                <span>👁 {p.views || 0} views</span>
              </div>
              {(p.apply_link || p.notification_pdf) && (
                <div className="mt-2 flex gap-2">
                  {p.apply_link && <a href={p.apply_link} target="_blank" rel="nofollow" className="btn-red text-xs">Apply Online</a>}
                  {p.notification_pdf && <a href={p.notification_pdf} target="_blank" rel="nofollow" className="btn-blue text-xs">Download Notification</a>}
                </div>
              )}
            </li>
          ))}
          {posts.length === 0 && <li className="p-8 text-center text-gray-500">No posts yet. Auto-updating... Check back soon!</li>}
        </ul>

        {pagination.pages > 1 && (
          <div className="bg-gray-100 p-3 flex justify-center gap-2">
            {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(n => (
              <Link key={n} href={`/${category}${n > 1 ? `?page=${n}` : ''}`}
                className={`px-3 py-1 border rounded text-sm ${pagination.page === n ? 'bg-red-600 text-white' : 'bg-white hover:bg-red-50'}`}>
                {n}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export async function getServerSideProps({ query, params }) {
  const category = params.category;
  const page = query.page ? parseInt(query.page) : 1;
  const meta = CATEGORY_META[category];

  if (!meta) return { notFound: true };

  const data = getAllPosts({ category, limit: 20, page });

  return {
    props: {
      posts: JSON.parse(JSON.stringify(data.posts)),
      category,
      pagination: data.pagination,
      categoryInfo: meta
    }
  };
}
