import { useState } from 'react';
import { useRouter } from 'next/router';
import toast, { Toaster } from 'react-hot-toast';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Logged in!');
        router.push('/admin');
      } else {
        toast.error(data.error || 'Login failed');
      }
    } catch (e) {
      toast.error('Connection error');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <Toaster />
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h1 className="text-2xl font-bold text-red-700 text-center mb-6">🔴 Admin Panel - Sarkari Result</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1">Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required
              className="w-full border px-3 py-2 rounded" />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full border px-3 py-2 rounded" />
          </div>
          <button type="submit" disabled={loading} className="w-full btn-red py-2 disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-4 text-center">Default: admin / admin123</p>
      </div>
    </div>
  );
}

AdminLogin.getLayout = function getLayout(page) { return page; };
