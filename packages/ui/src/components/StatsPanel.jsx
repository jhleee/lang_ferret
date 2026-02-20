import React from 'react';
import useSWR from 'swr';
import { apiUrl } from '../store.js';

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function StatsPanel() {
  const { data: stats } = useSWR(apiUrl('/api/stats'), fetcher, { refreshInterval: 5000 });

  if (!stats) return null;

  const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString());

  return (
    <div className="flex items-center gap-4 text-xs text-gray-400">
      <Stat label="Traces" value={fmt(stats.total_traces)} />
      <Stat label="Runs" value={fmt(stats.total_runs)} />
      <Stat label="Avg" value={stats.avg_latency_ms != null ? `${Math.round(stats.avg_latency_ms)}ms` : '-'} />
      <Stat label="Errors" value={stats.error_rate != null ? `${stats.error_rate}%` : '-'}
        className={stats.error_rate > 0 ? 'text-red-400' : ''} />
    </div>
  );
}

function Stat({ label, value, className = '' }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium text-gray-300 ${className}`}>{value}</span>
    </div>
  );
}
