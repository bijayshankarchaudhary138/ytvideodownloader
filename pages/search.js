import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { format, parseISO } from 'date-fns';

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState(router.query.q || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query)}`, undefined, { shallow: true });
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch (e) {
      setResults([]);
    }
    setLoading(false);
  };

  return (
    <div className="bg-white border rounded p-6">
      <h1 className="text-2xl font-bold text-red-700 mb-4">Search Sarkari Result</h1>
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search jobs, results, admit cards..."
          className="flex-1 border border-gray-300 px-4 py-2 rounded focus:outline-none focus:border-red-500"
        />
        <button type="submit" className="btn-red">Search</button>
      </form>

      {loading && <p className="text-gray-600">Searching...</p>}
      {searched && !loading && results.length === 0 && (
        <p className="text-gray-600">No results found for "{query}". Try different keywords like SSC, UPSC, Railway, BPSC, Teacher, etc.</p>
      )}

      <ul className="divide-y">
        {results.map(p => (
          <li key={p.id} className="py-3 hover:bg-red-50">
            <Link href={`/post/${p.slug}`} className="post-link font-semibold">{p.title}</Link>
            <p className="text-sm text-gray-600 mt-1">{p.short_info?.substring(0, 150)}...</p>
            <div className="text-xs text-gray-500 mt-1">{format(parseISO(p.post_date + 'T00:00:00'), 'dd MMM yyyy')}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
