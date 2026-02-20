import React, { useState } from 'react';

const TYPE_COLORS = {
  string: 'text-emerald-400',
  number: 'text-amber-400',
  boolean: 'text-purple-400',
  null: 'text-gray-500',
  key: 'text-blue-300',
};

export default function JsonViewer({ data, defaultExpandDepth = 2 }) {
  if (data === undefined || data === null) {
    return <span className={TYPE_COLORS.null}>null</span>;
  }
  if (typeof data === 'string') {
    // Try parsing as JSON
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed === 'object' && parsed !== null) {
        return <JsonNode value={parsed} depth={0} maxDepth={defaultExpandDepth} />;
      }
    } catch { /* not JSON, render as string */ }
    return <span className={TYPE_COLORS.string}>"{data}"</span>;
  }
  return <JsonNode value={data} depth={0} maxDepth={defaultExpandDepth} />;
}

function JsonNode({ value, depth, maxDepth }) {
  if (value === null) return <span className={TYPE_COLORS.null}>null</span>;
  if (value === undefined) return <span className={TYPE_COLORS.null}>undefined</span>;

  const type = typeof value;
  if (type === 'string') return <StringValue value={value} />;
  if (type === 'number') return <span className={TYPE_COLORS.number}>{value}</span>;
  if (type === 'boolean') return <span className={TYPE_COLORS.boolean}>{String(value)}</span>;

  if (Array.isArray(value)) {
    return <CollapsibleNode value={value} depth={depth} maxDepth={maxDepth} isArray />;
  }
  if (type === 'object') {
    return <CollapsibleNode value={value} depth={depth} maxDepth={maxDepth} isArray={false} />;
  }

  return <span className="text-gray-400">{String(value)}</span>;
}

function StringValue({ value }) {
  const isLong = value.length > 120;
  const [expanded, setExpanded] = useState(false);

  if (!isLong) {
    return <span className={TYPE_COLORS.string}>"{value}"</span>;
  }

  return (
    <span className={TYPE_COLORS.string}>
      "{expanded ? value : value.slice(0, 120)}
      {!expanded && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
          className="text-blue-400 hover:text-blue-300 mx-1"
        >
          ...({value.length} chars)
        </button>
      )}
      {expanded && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
          className="text-blue-400 hover:text-blue-300 mx-1"
        >
          (collapse)
        </button>
      )}
      "
    </span>
  );
}

function CollapsibleNode({ value, depth, maxDepth, isArray }) {
  const [open, setOpen] = useState(depth < maxDepth);

  const entries = isArray ? value : Object.entries(value);
  const count = isArray ? value.length : Object.keys(value).length;
  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';
  const preview = isArray ? `${count} items` : `${count} keys`;

  if (count === 0) {
    return <span className="text-gray-400">{openBracket}{closeBracket}</span>;
  }

  if (!open) {
    return (
      <span
        className="cursor-pointer hover:bg-gray-800/50 rounded px-0.5"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        <span className="text-gray-500">{openBracket}</span>
        <span className="text-gray-500 italic mx-1">{preview}</span>
        <span className="text-gray-500">{closeBracket}</span>
      </span>
    );
  }

  return (
    <span>
      <span
        className="cursor-pointer text-gray-500 hover:text-gray-300"
        onClick={(e) => { e.stopPropagation(); setOpen(false); }}
      >
        {openBracket}
      </span>
      <div className="pl-4 border-l border-gray-800 ml-1">
        {isArray
          ? entries.map((item, i) => (
              <div key={i} className="flex">
                <span className="shrink-0 select-none text-gray-600 mr-2 text-right" style={{ minWidth: '1.5rem' }}>
                  {i}
                </span>
                <span className="min-w-0">
                  <JsonNode value={item} depth={depth + 1} maxDepth={maxDepth} />
                  {i < count - 1 && <span className="text-gray-600">,</span>}
                </span>
              </div>
            ))
          : entries.map(([key, val], i) => (
              <div key={key} className="flex">
                <span className={`shrink-0 ${TYPE_COLORS.key} mr-1`}>"{key}"</span>
                <span className="text-gray-600 mr-1">:</span>
                <span className="min-w-0">
                  <JsonNode value={val} depth={depth + 1} maxDepth={maxDepth} />
                  {i < count - 1 && <span className="text-gray-600">,</span>}
                </span>
              </div>
            ))
        }
      </div>
      <span
        className="cursor-pointer text-gray-500 hover:text-gray-300"
        onClick={(e) => { e.stopPropagation(); setOpen(false); }}
      >
        {closeBracket}
      </span>
    </span>
  );
}
