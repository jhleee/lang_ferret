import React, { useState } from 'react';
import { useStore } from '../store.js';
import PromptViewer from './PromptViewer.jsx';
import JsonViewer from './JsonViewer.jsx';

const TABS = [
  { id: 'io', label: 'I/O' },
  { id: 'meta', label: 'Meta' },
];

export default function RunDetail({ runs }) {
  const selectedRunId = useStore((s) => s.selectedRunId);
  const setSelectedRunId = useStore((s) => s.setSelectedRunId);
  const [activeTab, setActiveTab] = useState('io');

  if (!selectedRunId || !runs) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Select a run to view details
      </div>
    );
  }

  const run = runs.find((r) => r.id === selectedRunId);
  if (!run) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Run not found
      </div>
    );
  }

  const durationMs = run.end_time ? run.end_time - run.start_time : 0;
  const duration = run.end_time
    ? durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`
    : '...';
  const isError = run.status === 'error';

  const metadata = tryParse(run.metadata);
  const extra = tryParse(run.extra);
  const hasMeta = metadata || extra;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold font-mono truncate">{run.name || run.id.slice(0, 12)}</h3>
          <button
            onClick={() => setSelectedRunId(null)}
            className="text-gray-400 hover:text-gray-200 text-xs px-1.5 py-0.5"
          >
            &times;
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300">{run.run_type}</span>
          <span className={`px-2 py-0.5 rounded ${isError ? 'bg-red-950 text-red-400' : 'bg-emerald-950 text-emerald-400'}`}>
            {run.status || 'running'}
          </span>
          <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-400">{duration}</span>
        </div>

        {isError && run.error && (
          <div className="text-xs text-red-400 bg-red-950/30 rounded px-3 py-2 mb-3">
            {(() => {
              try {
                const parsed = JSON.parse(run.error);
                return parsed?.message || run.error;
              } catch {
                return run.error;
              }
            })()}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors relative
                ${activeTab === tab.id
                  ? 'text-gray-200'
                  : 'text-gray-500 hover:text-gray-300'}`}
            >
              {tab.label}
              {tab.id === 'meta' && hasMeta && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
              )}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 pt-3">
        {activeTab === 'io' && <PromptViewer run={run} />}
        {activeTab === 'meta' && <MetaTab metadata={metadata} extra={extra} run={run} />}
      </div>
    </div>
  );
}

function MetaTab({ metadata, extra, run }) {
  return (
    <div className="space-y-4 text-xs">
      {/* Run info */}
      <Section title="Run Info">
        <div className="space-y-1 text-gray-400">
          <div><span className="text-gray-500">ID:</span> <span className="font-mono">{run.id}</span></div>
          <div><span className="text-gray-500">Trace:</span> <span className="font-mono">{run.trace_id}</span></div>
          {run.parent_id && (
            <div><span className="text-gray-500">Parent:</span> <span className="font-mono">{run.parent_id}</span></div>
          )}
          <div>
            <span className="text-gray-500">Time:</span>{' '}
            {new Date(run.start_time).toLocaleString()}
            {run.end_time && <> &rarr; {new Date(run.end_time).toLocaleString()}</>}
          </div>
          {(run.tokens_prompt != null || run.tokens_completion != null) && (
            <div>
              <span className="text-gray-500">Tokens:</span>{' '}
              prompt={run.tokens_prompt ?? '-'} / completion={run.tokens_completion ?? '-'}
            </div>
          )}
        </div>
      </Section>

      {/* SDK Metadata (unmapped fields) */}
      {metadata && (
        <Section title="SDK Metadata">
          <div className="bg-gray-900 rounded p-2 overflow-x-auto font-mono">
            <JsonViewer data={metadata} defaultExpandDepth={3} />
          </div>
        </Section>
      )}

      {/* Extra */}
      {extra && (
        <Section title="Extra">
          <div className="bg-gray-900 rounded p-2 overflow-x-auto font-mono">
            <JsonViewer data={extra} defaultExpandDepth={3} />
          </div>
        </Section>
      )}

      {!metadata && !extra && (
        <div className="text-gray-500 text-center py-8">No metadata available</div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{title}</h4>
      {children}
    </div>
  );
}

function tryParse(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return str; }
}
