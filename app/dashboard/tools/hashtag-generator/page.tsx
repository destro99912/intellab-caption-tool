'use client';

import { useState, useTransition } from 'react';

export default function HashtagTool() {
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState<'instagram'|'tiktok'|'youtube'>('instagram');
  const [region, setRegion] = useState('UAE');
  const [tone, setTone] = useState('friendly');
  const [loading, startTransition] = useTransition();
  const [result, setResult] = useState<{caption:string; hashtags:string[]} | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setResult(null);

    startTransition(async () => {
      try {
        const res = await fetch('/api/tools/hashtags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, platform, region, tone }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setResult(data);
      } catch (err:any) {
        setError(err.message || 'Failed to generate');
      }
    });
  }

  function copy(text:string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-3xl font-semibold">Hashtag & Caption Generator</h1>

      <form onSubmit={onGenerate} className="grid gap-4 bg-white/5 p-4 rounded-xl">
        <label className="grid gap-2">
          <span className="text-sm">Topic / Keyword</span>
          <input
            value={topic}
            onChange={(e)=>setTopic(e.target.value)}
            placeholder="e.g., cotton rope baskets"
            className="rounded-md border border-zinc-700 bg-black/20 p-2"
            required
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="grid gap-2">
            <span className="text-sm">Platform</span>
            <select
              value={platform}
              onChange={(e)=>setPlatform(e.target.value as any)}
              className="rounded-md border border-zinc-700 bg-black/20 p-2"
            >
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube</option>
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm">Region</span>
            <input
              value={region}
              onChange={(e)=>setRegion(e.target.value)}
              placeholder="e.g., UAE, Pakistan, Global"
              className="rounded-md border border-zinc-700 bg-black/20 p-2"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm">Tone</span>
            <select
              value={tone}
              onChange={(e)=>setTone(e.target.value)}
              className="rounded-md border border-zinc-700 bg-black/20 p-2"
            >
              <option>friendly</option>
              <option>professional</option>
              <option>fun</option>
              <option>luxury</option>
              <option>educational</option>
            </select>
          </label>
        </div>

        <button
          disabled={loading || !topic.trim()}
          className="inline-flex items-center justify-center rounded-md bg-orange-500 px-4 py-2 text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {loading ? 'Generating…' : 'Generate'}
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-950/20 p-3 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="grid gap-4">
          <div className="rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-medium">Caption</h2>
              <button onClick={()=>copy(result.caption)} className="text-xs underline">Copy</button>
            </div>
            <p className="whitespace-pre-wrap leading-relaxed">{result.caption}</p>
          </div>

          <div className="rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-medium">Hashtags ({result.hashtags.length})</h2>
              <button
                onClick={()=>copy(result.hashtags.join(' '))}
                className="text-xs underline"
              >
                Copy all
              </button>
            </div>
            <p className="text-sm leading-7">
              {result.hashtags.map((h)=>(
                <span key={h} className="mr-2">{h}</span>
              ))}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
