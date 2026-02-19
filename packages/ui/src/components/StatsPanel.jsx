import React from 'react';
import useSWR from 'swr';
import { apiUrl } from '../store.js';

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function StatsPanel() {
  const { data: stats } = useSWR(apiUrl('/api/stats'), fetcher, { refreshInterval: 5000 });
  const { data: health } = useSWR(apiUrl('/api/health'), fetcher, { refreshInterval: 5000 });

  if (!stats) return <div className="text-gray-500 text-sm">Loading...</div>;

  const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString());

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Statistics</h2>
      <div className="space-y-3">
        <Stat label="Total Traces" value={fmt(stats.total_traces)} />
        <Stat label="Total Runs" value={fmt(stats.total_runs)} />
        <Stat label="Avg Latency" value={stats.avg_latency_ms != null ? `${Math.round(stats.avg_latency_ms)}ms` : '-'} />
        <Stat label="Error Rate" value={stats.error_rate != null ? `${stats.error_rate}%` : '-'}
          className={stats.error_rate > 0 ? 'text-red-400' : ''} />
        <Stat label="Prompt Tokens" value={fmt(stats.total_prompt_tokens)} />
        <Stat label="Compl. Tokens" value={fmt(stats.total_completion_tokens)} />
      </div>
      {health && (
        <>
          <hr className="border-gray-800" />
          <div className="space-y-2">
            <Stat label="Buffer" value={health.buffer_size} />
            <Stat label="DB Size" value={`${health.db_size_mb} MB`} />
            <Stat label="SSE Clients" value={health.sse_clients} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, className = '' }) {
  return (
    <div>
      <div className="text-[11px] text-gray-500 uppercase">{label}</div>
      <div className={`text-sm font-medium ${className}`}>{value}</div>
    </div>
  );
}
