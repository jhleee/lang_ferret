import React from 'react';
import { useStore } from './store.js';
import TraceList from './pages/TraceList.jsx';
import TraceDetail from './pages/TraceDetail.jsx';
import StatsPanel from './components/StatsPanel.jsx';

export default function App() {
  const selectedTraceId = useStore((s) => s.selectedTraceId);

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">local-lang-trace</h1>
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 border-r border-gray-800 p-4 overflow-y-auto bg-gray-900/50">
          <StatsPanel />
        </aside>

        <main className="flex-1 flex overflow-hidden">
          <div className={`${selectedTraceId ? 'w-1/2' : 'w-full'} overflow-y-auto`}>
            <TraceList />
          </div>
          {selectedTraceId && (
            <div className="w-1/2 border-l border-gray-800 overflow-y-auto">
              <TraceDetail traceId={selectedTraceId} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
