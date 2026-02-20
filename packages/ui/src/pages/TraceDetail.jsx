import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useStore, apiUrl } from '../store.js';
import RunTree from '../components/RunTree.jsx';
import WaterfallTimeline from '../components/WaterfallTimeline.jsx';

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function TraceDetail({ traceId }) {
  const setSelectedTraceId = useStore((s) => s.setSelectedTraceId);
  const setTraceRuns = useStore((s) => s.setTraceRuns);
  const [highlightId, setHighlightId] = useState(null);
  const { data, error } = useSWR(
    traceId ? apiUrl(`/api/traces/${traceId}`) : null,
    fetcher
  );

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

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold font-mono">{root.name || traceId.slice(0, 12)}</h2>
          <div className="text-xs text-gray-400">
            {new Date(root.start_time).toLocaleString()} &middot; {totalDuration}
          </div>
        </div>
        <button onClick={() => setSelectedTraceId(null)}
          className="text-gray-400 hover:text-gray-200 text-sm px-2 py-1">
          Close
        </button>
      </div>
      <WaterfallTimeline runs={data.runs} onSelect={setHighlightId} />
      <RunTree runs={data.runs} highlightId={highlightId} />
    </div>
  );
}
