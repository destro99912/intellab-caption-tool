'use client';

import { useState } from 'react';

type ApiResponse = {
  hashtags?: string[];
  caption?: string;
  error?: string;
};

export default function HashtagGeneratorPage() {
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState<'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'twitter'>('instagram');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch('/api/tools/hashtags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, platform }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Request failed with status ${res.status}`);
      }

      const json: ApiResponse = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Hashtag & Caption Generator</h1>

      <form onSubmit={handleGenerate} className="space-y-4 border rounded-lg p-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Topic / Description</label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Cozy cotton rope baskets for nursery storage"
            className="w-full border rounded-md p-2 min-h-[96px]"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as any)}
            className="w-full border rounded-md p-2"
          >
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
            <option value="linkedin">LinkedIn</option>
            <option value="twitter">Twitter/X</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-black text-white disabled:opacity-60"
        >
          {loading ? 'Generating…' : 'Generate'}
        </button>
      </form>

      {/* Results */}
      <div className="mt-6 space-y-4">
        {error && (
          <div className="border border-red-300 bg-red-50 text-red-800 rounded-md p-3">
            {error}
          </div>
        )}

        {data?.caption && (
          <div className="border rounded-md p-3">
            <div className="text-sm font-medium mb-2">Caption</div>
            <p className="whitespace-pre-wrap">{data.caption}</p>
          </div>
        )}

        {data?.hashtags && data.hashtags.length > 0 && (
          <div className="border rounded-md p-3">
            <div className="text-sm font-medium mb-2">Hashtags</div>
            <div className="flex flex-wrap gap-2">
              {data.hashtags.map((h, i) => (
                <span key={i} className="px-2 py-1 text-sm rounded bg-gray-100 border">
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
