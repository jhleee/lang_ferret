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

function formatDuration(start, end) {
  if (!end) return '-';
  const ms = end - start;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function formatTokens(prompt, completion) {
  const total = (prompt || 0) + (completion || 0);
  return total > 0 ? `${total.toLocaleString()} t` : '-';
}

export default function TraceList() {
  const { from: defaultFrom, to: defaultTo } = defaultTimeRange();
  const [filters, setFilters] = useState({ status: '', name: '', from: defaultFrom, to: defaultTo });
  const [viewMode, setViewMode] = useState('flat'); // 'flat' | 'thread'

  function handleFilterChange(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="p-3">
      {/* Filters */}
      <div className="flex gap-1.5 mb-3 flex-wrap">
        <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
          <option value="">All Status</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>
        <input type="text" placeholder="Search name..." value={filters.name}
          onChange={(e) => handleFilterChange('name', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs flex-1 min-w-0" />
      </div>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        <input type="datetime-local" value={filters.from}
          onChange={(e) => handleFilterChange('from', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs flex-1 min-w-0" />
        <input type="datetime-local" value={filters.to}
          onChange={(e) => handleFilterChange('to', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs flex-1 min-w-0" />
      </div>

      {/* View mode toggle */}
      <div className="flex mb-3 border border-gray-700 rounded overflow-hidden">
        <button
          onClick={() => setViewMode('flat')}
          className={`flex-1 px-2 py-1 text-xs font-medium transition-colors
            ${viewMode === 'flat' ? 'bg-gray-700 text-gray-200' : 'bg-gray-800/50 text-gray-500 hover:text-gray-300'}`}
        >
          Traces
        </button>
        <button
          onClick={() => setViewMode('thread')}
          className={`flex-1 px-2 py-1 text-xs font-medium transition-colors
            ${viewMode === 'thread' ? 'bg-gray-700 text-gray-200' : 'bg-gray-800/50 text-gray-500 hover:text-gray-300'}`}
        >
          Threads
        </button>
      </div>

      {viewMode === 'flat'
        ? <FlatTraceList filters={filters} />
        : <ThreadGroupList filters={filters} />
      }
    </div>
  );
}

/* ── Flat trace list (original) ── */
function FlatTraceList({ filters }) {
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

  const { data, mutate } = useSWR(apiUrl(`/api/traces?${params}`), fetcher, { refreshInterval: 5000 });

  useSSE(mutate);

  useEffect(() => {
    if (data) {
      if (offset === 0) setAllTraces(data);
      else setAllTraces((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    }
  }, [data, offset]);

  // Reset on filter change
  const prevFilters = useRef(filters);
  useEffect(() => {
    if (prevFilters.current !== filters) {
      prevFilters.current = filters;
      setOffset(0);
      setAllTraces([]);
    }
  }, [filters]);

  const observer = useRef();
  const lastRef = useCallback((node) => {
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore) setOffset((prev) => prev + PAGE_SIZE);
    });
    if (node) observer.current.observe(node);
  }, [hasMore]);

  return (
    <div className="space-y-0.5">
      {allTraces.map((trace, i) => (
        <TraceRow
          key={trace.id}
          trace={trace}
          isSelected={trace.trace_id === selectedTraceId}
          onClick={() => setSelectedTraceId(trace.trace_id)}
          ref={i === allTraces.length - 1 ? lastRef : undefined}
        />
      ))}
      {allTraces.length === 0 && (
        <div className="text-gray-500 text-sm text-center py-8">No traces yet.</div>
      )}
    </div>
  );
}

/* ── Thread-grouped list ── */
function ThreadGroupList({ filters }) {
  const [threads, setThreads] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const params = new URLSearchParams();
  params.set('limit', PAGE_SIZE);
  params.set('offset', offset);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const { data, mutate } = useSWR(apiUrl(`/api/threads?${params}`), fetcher, { refreshInterval: 5000 });

  useSSE(mutate);

  useEffect(() => {
    if (data) {
      if (offset === 0) setThreads(data);
      else setThreads((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    }
  }, [data, offset]);

  const prevFilters = useRef(filters);
  useEffect(() => {
    if (prevFilters.current !== filters) {
      prevFilters.current = filters;
      setOffset(0);
      setThreads([]);
    }
  }, [filters]);

  const observer = useRef();
  const lastRef = useCallback((node) => {
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore) setOffset((prev) => prev + PAGE_SIZE);
    });
    if (node) observer.current.observe(node);
  }, [hasMore]);

  return (
    <div className="space-y-1">
      {threads.map((thread, i) => (
        <ThreadGroup
          key={thread.thread_id}
          thread={thread}
          filters={filters}
          ref={i === threads.length - 1 ? lastRef : undefined}
        />
      ))}
      {threads.length === 0 && (
        <div className="text-gray-500 text-sm text-center py-8">No threads found.</div>
      )}
    </div>
  );
}

const ThreadGroup = React.forwardRef(function ThreadGroup({ thread, filters }, ref) {
  const [open, setOpen] = useState(false);

  return (
    <div ref={ref}>
      <div
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between px-2 py-1.5 rounded cursor-pointer hover:bg-gray-800/50 border-l-2 border-blue-500/40"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-gray-600 text-xs w-4">{open ? '\u25BC' : '\u25B6'}</span>
          <span className="font-mono text-xs truncate text-gray-300" title={thread.thread_id}>
            {thread.thread_id.length > 20
              ? `...${thread.thread_id.slice(-16)}`
              : thread.thread_id}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500 shrink-0">
          <span>{thread.trace_count} traces</span>
          {thread.error_count > 0 && (
            <span className="text-red-400">{thread.error_count} err</span>
          )}
          <span>{new Date(thread.last_time).toLocaleTimeString()}</span>
        </div>
      </div>
      {open && <ThreadTraces threadId={thread.thread_id} filters={filters} />}
    </div>
  );
});

function ThreadTraces({ threadId, filters }) {
  const setSelectedTraceId = useStore((s) => s.setSelectedTraceId);
  const selectedTraceId = useStore((s) => s.selectedTraceId);

  const params = new URLSearchParams();
  params.set('limit', '100');
  params.set('offset', '0');
  params.set('thread_id', threadId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const { data } = useSWR(apiUrl(`/api/traces?${params}`), fetcher);

  if (!data) return <div className="pl-6 py-1 text-xs text-gray-500">Loading...</div>;
  if (data.length === 0) return <div className="pl-6 py-1 text-xs text-gray-500">No traces</div>;

  return (
    <div className="pl-4 border-l border-gray-800 ml-3 space-y-0.5 my-0.5">
      {data.map((trace) => (
        <TraceRow
          key={trace.id}
          trace={trace}
          isSelected={trace.trace_id === selectedTraceId}
          onClick={() => setSelectedTraceId(trace.trace_id)}
          compact
        />
      ))}
    </div>
  );
}

/* ── Shared trace row ── */
const TraceRow = React.forwardRef(function TraceRow({ trace, isSelected, onClick, compact }, ref) {
  return (
    <div
      ref={ref}
      onClick={onClick}
      className={`flex items-center justify-between px-2 ${compact ? 'py-1' : 'py-1.5'} rounded cursor-pointer transition-colors
        ${isSelected ? 'bg-gray-700' : 'hover:bg-gray-800/50'}
        ${trace.status === 'error' ? 'border-l-2 border-red-500' : 'border-l-2 border-transparent'}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`text-[10px] ${trace.status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
          {trace.status === 'error' ? '!!' : 'OK'}
        </span>
        <span className={`font-mono ${compact ? 'text-xs' : 'text-sm'} truncate`}>
          {trace.name || trace.trace_id?.slice(0, 8)}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-gray-400 shrink-0">
        <span>{formatDuration(trace.start_time, trace.end_time)}</span>
        <span>{formatTokens(trace.tokens_prompt, trace.tokens_completion)}</span>
        <span>{new Date(trace.start_time).toLocaleTimeString()}</span>
      </div>
    </div>
  );
});

/* ── SSE hook ── */
function useSSE(mutate) {
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
}
