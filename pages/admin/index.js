import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import toast, { Toaster } from 'react-hot-toast';

export default function AdminDashboard() {
  const router = useRouter();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [formData, setFormData] = useState({
    quickMode: true,
    title: '',
    sourceUrl: '',
    category: 'latest-jobs'
  });

  useEffect(() => { loadPosts(); }, []);

  async function loadPosts() {
    try {
      const res = await fetch('/api/admin/posts');
      if (res.status === 401) { router.push('/admin/login'); return; }
      const data = await res.json();
      setPosts(data.posts || []);
    } catch (e) {}
    setLoading(false);
  }

  async function handleQuickPost(e) {
    e.preventDefault();
    const loadingToast = toast.loading('Auto-generating post content...');
    try {
      const res = await fetch('/api/admin/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoGenerate: true,
          ...formData
        })
      });
      const data = await res.json();
      toast.success(`Post created! Slug: ${data.slug}`, { id: loadingToast });
      setShowForm(false);
      setFormData({ quickMode: true, title: '', sourceUrl: '', category: 'latest-jobs' });
      loadPosts();
    } catch (e) {
      toast.error('Error creating post', { id: loadingToast });
    }
  }

  async function runScraper() {
    setScraping(true);
    const t = toast.loading('Running auto-scraper on all official websites...');
    try {
      const res = await fetch('/api/admin/scrape-now');
      const data = await res.json();
      toast.success(`Scrape complete! ${data.postsCreated} new posts created.`, { id: t });
      loadPosts();
    } catch (e) {
      toast.error('Scraper error', { id: t });
    }
    setScraping(false);
  }

  async function toggleTrending(id, current) {
    await fetch('/api/admin/posts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_trending: current ? 0 : 1 })
    });
    loadPosts();
  }

  async function deletePost(id) {
    if (!confirm('Delete this post?')) return;
    await fetch(`/api/admin/posts?id=${id}`, { method: 'DELETE' });
    toast.success('Post deleted');
    loadPosts();
  }

  async function logout() {
    await fetch('/api/admin/logout');
    router.push('/admin/login');
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Toaster />
      <header className="bg-red-700 text-white px-4 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">🔴 Sarkari Result - Admin Dashboard</h1>
          <div className="flex gap-2">
            <a href="/" target="_blank" className="bg-white text-red-700 px-3 py-1 rounded text-sm font-bold">View Site</a>
            <button onClick={logout} className="bg-gray-800 text-white px-3 py-1 rounded text-sm">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded shadow border-l-4 border-red-600">
            <h3 className="font-bold text-gray-700">Total Posts</h3>
            <p className="text-3xl font-bold text-red-600">{posts.length}</p>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="bg-green-600 text-white p-4 rounded shadow font-bold text-lg hover:bg-green-700">
            ➕ Create New Post (1-Click)
          </button>
          <button onClick={runScraper} disabled={scraping}
            className="bg-blue-600 text-white p-4 rounded shadow font-bold text-lg hover:bg-blue-700 disabled:opacity-50">
            ⚡ {scraping ? 'Scraping...' : 'Run Auto-Scraper Now'}
          </button>
        </div>

        {/* Quick Post Form */}
        {showForm && (
          <div className="bg-white p-6 rounded shadow mb-6 border-2 border-green-500">
            <h2 className="text-xl font-bold mb-4">⚡ Quick Post - Auto-Generate Sarkari Result Format</h2>
            <p className="text-sm text-gray-600 mb-4">Just paste the notification title and URL. Our system will automatically generate a full SEO-optimized post in SarkariResult.com format with all sections (dates, fee, age limit, eligibility, FAQs, important links).</p>
            <form onSubmit={handleQuickPost} className="space-y-4">
              <div>
                <label className="block font-bold mb-1">Notification Title *</label>
                <input type="text" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}
                  placeholder="e.g., BPSC 70th Combined Competitive Exam 2026 Online Form"
                  className="w-full border px-3 py-2 rounded" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">Official Notification URL</label>
                  <input type="url" value={formData.sourceUrl} onChange={e => setFormData({...formData, sourceUrl: e.target.value})}
                    placeholder="https://..." className="w-full border px-3 py-2 rounded" />
                </div>
                <div>
                  <label className="block font-bold mb-1">Category</label>
                  <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full border px-3 py-2 rounded">
                    <option value="latest-jobs">Latest Jobs / Online Form</option>
                    <option value="results">Result</option>
                    <option value="admit-card">Admit Card</option>
                    <option value="answer-key">Answer Key</option>
                    <option value="syllabus">Syllabus</option>
                    <option value="admission">Admission</option>
                    <option value="scholarship">Scholarship</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-red px-6 py-2">🚀 Generate & Publish Post</button>
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 border rounded">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Posts List */}
        <div className="bg-white rounded shadow overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <h2 className="text-lg font-bold">All Posts ({posts.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-2">ID</th>
                  <th className="text-left p-2">Title</th>
                  <th className="text-left p-2">Category</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Views</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {posts.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="p-2">{p.id}</td>
                    <td className="p-2">
                      <a href={`/post/${p.slug}`} target="_blank" className="text-blue-600 hover:underline font-medium">
                        {p.is_trending && '🔥 '}{p.title.substring(0, 70)}...
                      </a>
                    </td>
                    <td className="p-2"><span className="text-xs bg-gray-200 px-2 py-1 rounded">{p.category}</span></td>
                    <td className="p-2 text-xs">{p.post_date}</td>
                    <td className="p-2">{p.views || 0}</td>
                    <td className="p-2 space-x-1">
                      <button onClick={() => toggleTrending(p.id, p.is_trending)}
                        className={`text-xs px-2 py-1 rounded ${p.is_trending ? 'bg-yellow-500 text-white' : 'bg-gray-200'}`}>
                        {p.is_trending ? '★ Trending' : 'Mark Trending'}
                      </button>
                      <a href={`/post/${p.slug}`} target="_blank" className="text-xs px-2 py-1 rounded bg-blue-500 text-white">View</a>
                      <button onClick={() => deletePost(p.id)} className="text-xs px-2 py-1 rounded bg-red-500 text-white">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
          <h3 className="font-bold text-blue-800">ℹ️ Auto-Posting Information</h3>
          <ul className="text-sm text-gray-700 mt-2 space-y-1 list-disc list-inside">
            <li>Auto-scraper monitors SSC, UPSC, Railway, IBPS, BPSC, UPPSC, UPSSSC, DSSSB, SBI, Army, Navy, Air Force, NTA, CBSE and more.</li>
            <li>Start the background scraper with: <code className="bg-gray-200 px-1 rounded">npm run scraper</code></li>
            <li>When running, scraper checks all sources EVERY 1 MINUTE - new notifications are posted within 1 minute.</li>
            <li>Each post is automatically formatted in exact SarkariResult.com format with full SEO optimization.</li>
            <li>Posts include JSON-LD schema, proper meta tags, FAQs, and interlinking for top Google ranking.</li>
            <li>Default admin: <strong>admin</strong> / <strong>admin123</strong> (change in production!)</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

// Skip Layout wrapper
AdminDashboard.getLayout = function getLayout(page) { return page; };
