import React, { useState } from 'react';
import PromptViewer from './PromptViewer.jsx';

export default function RunTree({ runs, highlightId }) {
  const tree = buildTree(runs);
  return (
    <div className="space-y-1">
      {tree.map((node) => (
        <RunNode key={node.id} node={node} depth={0} highlightId={highlightId} />
      ))}
    </div>
  );
}

function RunNode({ node, depth, highlightId }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const durationMs = node.end_time ? node.end_time - node.start_time : 0;
  const duration = node.end_time ? (durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`) : '...';
  const isError = node.status === 'error';
  const isHighlighted = highlightId === node.id;

  return (
    <div style={{ paddingLeft: depth * 20 }}>
      <div
        className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-gray-800/50
          ${isError ? 'text-red-400' : 'text-gray-200'}
          ${isHighlighted ? 'ring-1 ring-blue-500 bg-gray-800/60' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span className="text-gray-600 text-xs w-4">
          {hasChildren ? (open ? '\u25BC' : '\u25B6') : '\u2500'}
        </span>
        <span className="font-mono text-sm">{node.name || node.id.slice(0, 8)}</span>
        <span className="text-xs text-gray-500">({node.run_type})</span>
        <span className="ml-auto text-xs text-gray-400">{duration}</span>
      </div>
      {isError && node.error && (
        <div className="text-xs text-red-400 bg-red-950/30 rounded px-2 py-1 ml-6 mt-1">
          {typeof tryParse(node.error) === 'object'
            ? tryParse(node.error)?.message || node.error
            : node.error}
        </div>
      )}
      {open && <PromptViewer run={node} />}
      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <RunNode key={child.id} node={child} depth={depth + 1} highlightId={highlightId} />
          ))}
        </div>
      )}
    </div>
  );
}

function tryParse(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return str; }
}

function buildTree(runs) {
  const map = new Map();
  const roots = [];
  for (const r of runs) {
    map.set(r.id, { ...r, children: [] });
  }
  for (const r of runs) {
    const node = map.get(r.id);
    if (r.parent_id && map.has(r.parent_id)) {
      map.get(r.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
