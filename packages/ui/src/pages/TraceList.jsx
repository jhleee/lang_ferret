import React, { useState, useCallback, useRef, useEffect } from 'react';
import useSWR from 'swr';
import { useStore, apiUrl } from '../store.js';

const fetcher = (url) => fetch(url).then((r) => r.json());
const PAGE_SIZE = 50;

function toLocalISOString(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultTimeRange() {
  const now = new Date();
  const from = new Date(now.getTime() - 60 * 60 * 1000);
  const to = new Date(now.getTime() + 60 * 60 * 1000);
  return { from: toLocalISOString(from), to: toLocalISOString(to) };
}

export default function TraceList() {
  const { from: defaultFrom, to: defaultTo } = defaultTimeRange();
  const [filters, setFilters] = useState({ status: '', name: '', from: defaultFrom, to: defaultTo });
  const [allTraces, setAllTraces] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const setSelectedTraceId = useStore((s) => s.setSelectedTraceId);
  const selectedTraceId = useStore((s) => s.selectedTraceId);

  const params = new URLSearchParams();
  params.set('limit', PAGE_SIZE);
  params.set('offset', offset);
  if (filters.status) params.set('status', filters.status);
  if (filters.name) params.set('name', filters.name);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const { data, mutate } = useSWR(
    apiUrl(`/api/traces?${params}`),
    fetcher,
    { refreshInterval: 5000 }
  );

  useEffect(() => {
    let evtSource;
    let reconnectTimeout;
    const connect = () => {
      const base = import.meta.env.DEV ? '' : '/ui/..';
      evtSource = new EventSource(`${base}/api/events`);
      evtSource.addEventListener('trace:new', () => mutate());
      evtSource.onerror = () => {
        evtSource.close();
        reconnectTimeout = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => {
      if (evtSource) evtSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [mutate]);

  useEffect(() => {
    if (data) {
      if (offset === 0) {
        setAllTraces(data);
      } else {
        setAllTraces((prev) => [...prev, ...data]);
      }
      setHasMore(data.length === PAGE_SIZE);
    }
  }, [data, offset]);

  const observer = useRef();
  const lastRef = useCallback((node) => {
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore) {
        setOffset((prev) => prev + PAGE_SIZE);
      }
    });
    if (node) observer.current.observe(node);
  }, [hasMore]);

  function handleFilterChange(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
    setOffset(0);
    setAllTraces([]);
  }

  function formatDuration(start, end) {
    if (!end) return '-';
    const ms = end - start;
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  }

  function formatTokens(prompt, completion) {
    const total = (prompt || 0) + (completion || 0);
    return total > 0 ? `${total.toLocaleString()} t` : '-';
  }

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4 flex-wrap">
        <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm">
          <option value="">All Status</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>
        <input type="text" placeholder="Search name..." value={filters.name}
          onChange={(e) => handleFilterChange('name', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm w-40" />
        <input type="datetime-local" value={filters.from}
          onChange={(e) => handleFilterChange('from', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm" />
        <input type="datetime-local" value={filters.to}
          onChange={(e) => handleFilterChange('to', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm" />
      </div>

      <div className="space-y-1">
        {allTraces.map((trace, i) => {
          const isLast = i === allTraces.length - 1;
          const isSelected = trace.trace_id === selectedTraceId;
          return (
            <div key={trace.id} ref={isLast ? lastRef : undefined}
              onClick={() => setSelectedTraceId(trace.trace_id)}
              className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors
                ${isSelected ? 'bg-gray-700' : 'hover:bg-gray-800/50'}
                ${trace.status === 'error' ? 'border-l-2 border-red-500' : 'border-l-2 border-transparent'}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs ${trace.status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                  {trace.status === 'error' ? '!!' : 'OK'}
                </span>
                <span className="font-mono text-sm truncate">{trace.name || trace.trace_id?.slice(0, 8)}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400 shrink-0">
                <span>{formatDuration(trace.start_time, trace.end_time)}</span>
                <span>{formatTokens(trace.tokens_prompt, trace.tokens_completion)}</span>
                <span>{new Date(trace.start_time).toLocaleTimeString()}</span>
              </div>
            </div>
          );
        })}
        {allTraces.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-8">No traces yet. Send some requests!</div>
        )}
      </div>
    </div>
  );
}
