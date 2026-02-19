import React, { useState, useMemo, useEffect } from 'react';

const TYPE_COLORS = {
  chain: 'bg-blue-500',
  llm: 'bg-amber-500',
  tool: 'bg-emerald-500',
  retriever: 'bg-purple-500',
};

export default function WaterfallTimeline({ runs, onSelect }) {
  const [hoveredId, setHoveredId] = useState(null);
  if (!runs || runs.length === 0) return null;

  const traceStart = Math.min(...runs.map((r) => r.start_time));
  const traceEnd = Math.max(...runs.map((r) => r.end_time ?? r.start_time));
  const totalMs = traceEnd - traceStart || 1;

  const tree = useMemo(() => buildTree(runs), [runs]);

  // Root nodes expanded by default
  const rootIds = useMemo(() => new Set(tree.filter((n) => n.children.length > 0).map((n) => n.id)), [tree]);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  useEffect(() => { setExpandedIds((prev) => new Set([...prev, ...rootIds])); }, [rootIds]);

  // Build visible rows with tree guide info for connector lines
  const visibleRows = useMemo(() => {
    const rows = [];
    function walk(node, depth, guides = []) {
      const hasChildren = node.children.length > 0;
      const isExpanded = expandedIds.has(node.id);

      rows.push({ ...node, depth, hasChildren, isExpanded, guides });

      if (isExpanded) {
        node.children.forEach((child, i) => {
          walk(child, depth + 1, [...guides, i < node.children.length - 1]);
        });
      }
    }
    for (const root of tree) walk(root, 0, []);
    return rows;
  }, [tree, expandedIds]);

  const allFoldableIds = useMemo(() => {
    const ids = new Set();
    function walk(node) {
      if (node.children.length > 0) ids.add(node.id);
      for (const child of node.children) walk(child);
    }
    for (const root of tree) walk(root);
    return ids;
  }, [tree]);

  const allExpanded = allFoldableIds.size > 0 && [...allFoldableIds].every((id) => expandedIds.has(id));

  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedIds(new Set(allFoldableIds));
  }

  function collapseAll() {
    setExpandedIds(new Set());
  }

  // Time axis ticks
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const ms = (totalMs / tickCount) * i;
    return { pct: (ms / totalMs) * 100, label: ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms` };
  });

  const LABEL_W = 180;

  return (
    <div className="mb-4 border border-gray-800 rounded-lg overflow-hidden bg-gray-900/50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Timeline &middot; {totalMs >= 1000 ? `${(totalMs / 1000).toFixed(2)}s` : `${totalMs}ms`}
        </span>
        {allFoldableIds.size > 0 && (
          <button
            onClick={allExpanded ? collapseAll : expandAll}
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-800"
          >
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </button>
        )}
      </div>

      {/* Rows (time axis sticky inside scroll container) */}
      <div className="max-h-80 overflow-y-auto overflow-x-hidden scrollbar-thin pr-1">
        {/* Time axis */}
        <div className="sticky top-0 z-10 flex h-5 border-b border-gray-800 bg-gray-900/95">
          <div className="shrink-0" style={{ width: LABEL_W }} />
          <div className="relative flex-1">
            {ticks.map((t, i) => (
              <div key={i} className="absolute top-0 h-full flex flex-col items-center" style={{ left: `${t.pct}%` }}>
                <div className="w-px h-2 bg-gray-700" />
                <span className={`text-[9px] text-gray-500 ${i === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}>{t.label}</span>
              </div>
            ))}
          </div>
        </div>
        {visibleRows.map((run) => {
          const startPct = ((run.start_time - traceStart) / totalMs) * 100;
          const endTime = run.end_time ?? run.start_time;
          const widthPct = Math.max(((endTime - run.start_time) / totalMs) * 100, 0.5);
          const isHovered = hoveredId === run.id;
          const isError = run.status === 'error';
          const barColor = isError ? 'bg-red-500' : (TYPE_COLORS[run.run_type] || 'bg-gray-500');
          const durationMs = endTime - run.start_time;

          return (
            <div
              key={run.id}
              className={`flex items-center h-7 border-b border-gray-800/50 cursor-pointer transition-colors
                ${isHovered ? 'bg-gray-800/70' : 'hover:bg-gray-800/30'}`}
              onMouseEnter={() => setHoveredId(run.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => { if (run.hasChildren) toggleExpand(run.id); onSelect?.(run.id); }}
            >
              {/* Label with tree connectors and fold toggle */}
              <div
                className="shrink-0 flex items-center pl-1 pr-2 text-xs font-mono text-gray-300 truncate"
                style={{ width: LABEL_W }}
                title={run.name}
              >
                {/* Tree connector lines */}
                {Array.from({ length: run.depth }, (_, i) => {
                  const isConnector = i === run.depth - 1;
                  const continues = run.guides[i];
                  return (
                    <span key={i} className="inline-flex shrink-0 w-3.5 h-7 relative">
                      {isConnector ? (
                        <>
                          <span className={`absolute left-1.5 top-0 w-px ${continues ? 'h-full' : 'h-1/2'} bg-gray-700`} />
                          <span className="absolute left-1.5 top-1/2 w-2 h-px bg-gray-700" />
                        </>
                      ) : (
                        continues && <span className="absolute left-1.5 top-0 w-px h-full bg-gray-700" />
                      )}
                    </span>
                  );
                })}
                {run.hasChildren ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleExpand(run.id); }}
                    className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-300 shrink-0"
                  >
                    <svg className={`w-3 h-3 transition-transform ${run.isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                    </svg>
                  </button>
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <span className="truncate">{run.name || run.id.slice(0, 8)}</span>
              </div>

              {/* Bar area */}
              <div className="relative flex-1 h-full">
                {ticks.map((t, i) => (
                  <div key={i} className="absolute top-0 w-px h-full bg-gray-800/40" style={{ left: `${t.pct}%` }} />
                ))}

                <div
                  className={`absolute top-1 h-5 rounded-sm ${barColor} ${isHovered ? 'opacity-100' : 'opacity-80'} transition-opacity`}
                  style={{ left: `${startPct}%`, width: `${widthPct}%`, minWidth: 3 }}
                >
                  {widthPct > 8 && (
                    <span className="absolute inset-0 flex items-center px-1 text-[10px] text-white font-medium truncate">
                      {durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`}
                    </span>
                  )}
                </div>

                {isHovered && (
                  <div className="absolute z-20 bottom-full mb-1 bg-gray-950 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-gray-200 whitespace-nowrap pointer-events-none shadow-lg"
                    style={startPct > 50 ? { right: `${100 - startPct - widthPct}%` } : { left: `${startPct}%` }}>
                    {run.name} &middot; {run.run_type} &middot; {durationMs >= 1000 ? `${(durationMs / 1000).toFixed(2)}s` : `${durationMs}ms`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-3 px-3 py-1.5 border-t border-gray-800">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1 text-[10px] text-gray-400">
            <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
            {type}
          </div>
        ))}
        <div className="flex items-center gap-1 text-[10px] text-gray-400">
          <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
          error
        </div>
      </div>
    </div>
  );
}

function buildTree(runs) {
  const map = new Map();
  const roots = [];
  for (const r of runs) map.set(r.id, { ...r, children: [] });
  for (const r of runs) {
    const node = map.get(r.id);
    if (r.parent_id && map.has(r.parent_id)) map.get(r.parent_id).children.push(node);
    else roots.push(node);
  }
  return roots;
}
