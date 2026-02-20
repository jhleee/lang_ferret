import React, { useState, useEffect, useMemo } from 'react';
import useSWR from 'swr';
import { useStore, apiUrl } from '../store.js';
import RunTree from '../components/RunTree.jsx';
import WaterfallTimeline from '../components/WaterfallTimeline.jsx';

const fetcher = (url) => fetch(url).then((r) => r.json());

function isHidden(run) {
  try {
    const meta = typeof run.metadata === 'string' ? JSON.parse(run.metadata) : run.metadata;
    return Array.isArray(meta?.tags) && meta.tags.includes('langsmith:hidden');
  } catch { return false; }
}

function filterHiddenRuns(runs) {
  const hiddenIds = new Set(runs.filter(isHidden).map((r) => r.id));
  // Also hide children of hidden runs
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of runs) {
      if (!hiddenIds.has(r.id) && r.parent_id && hiddenIds.has(r.parent_id)) {
        hiddenIds.add(r.id);
        changed = true;
      }
    }
  }
  return runs.filter((r) => !hiddenIds.has(r.id));
}

export default function TraceDetail({ traceId }) {
  const setSelectedTraceId = useStore((s) => s.setSelectedTraceId);
  const setTraceRuns = useStore((s) => s.setTraceRuns);
  const [highlightId, setHighlightId] = useState(null);
  const [viewMode, setViewMode] = useState('simple');
  const { data, error } = useSWR(
    traceId ? apiUrl(`/api/traces/${traceId}`) : null,
    fetcher
  );

  const visibleRuns = useMemo(() => {
    if (!data?.runs) return [];
    return viewMode === 'simple' ? filterHiddenRuns(data.runs) : data.runs;
  }, [data, viewMode]);

  useEffect(() => {
    if (data?.runs) {
      setTraceRuns(data.runs);
    }
  }, [data, setTraceRuns]);

  if (!traceId) return null;
  if (error) return <div className="p-4 text-red-400">Failed to load trace</div>;
  if (!data) return <div className="p-4 text-gray-500">Loading...</div>;
  if (!data.runs || data.runs.length === 0) return <div className="p-4 text-gray-500">Trace not found</div>;

  const root = data.runs.find((r) => !r.parent_id) || data.runs[0];
  const totalDuration = root.end_time ? `${((root.end_time - root.start_time) / 1000).toFixed(1)}s` : '...';
  const hiddenCount = data.runs.length - visibleRuns.length;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold font-mono">{root.name || traceId.slice(0, 12)}</h2>
          <div className="text-xs text-gray-400">
            {new Date(root.start_time).toLocaleString()} &middot; {totalDuration}
            {viewMode === 'simple' && hiddenCount > 0 && (
              <span className="ml-2 text-gray-500">({hiddenCount} hidden)</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-gray-700 rounded overflow-hidden">
            <button
              onClick={() => setViewMode('simple')}
              className={`px-2 py-0.5 text-xs transition-colors
                ${viewMode === 'simple' ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Simple
            </button>
            <button
              onClick={() => setViewMode('detail')}
              className={`px-2 py-0.5 text-xs transition-colors
                ${viewMode === 'detail' ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Detail
            </button>
          </div>
          <button onClick={() => setSelectedTraceId(null)}
            className="text-gray-400 hover:text-gray-200 text-sm px-2 py-1">
            Close
          </button>
        </div>
      </div>
      <WaterfallTimeline runs={visibleRuns} onSelect={setHighlightId} />
      <RunTree runs={visibleRuns} highlightId={highlightId} />
    </div>
  );
}
