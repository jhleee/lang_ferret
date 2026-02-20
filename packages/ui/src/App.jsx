import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from './store.js';
import TraceList from './pages/TraceList.jsx';
import TraceDetail from './pages/TraceDetail.jsx';
import RunDetail from './components/RunDetail.jsx';
import StatsPanel from './components/StatsPanel.jsx';

const MIN_LEFT = 288;   // min-w-72
const MIN_RIGHT = 384;  // min-w-96
const INIT_LEFT = 288;
const INIT_RIGHT = 384;

function useDragResize(initial, minSize, direction) {
  const [size, setSize] = useState(initial);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startSize = useRef(0);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startSize.current = size;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [size]);

  useEffect(() => {
    const onPointerMove = (e) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      const next = direction === 'left'
        ? startSize.current + delta
        : startSize.current - delta;
      setSize(Math.max(minSize, next));
    };
    const onPointerUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [minSize, direction]);

  return { size, onPointerDown };
}

function DragHandle({ onPointerDown }) {
  return (
    <div
      className="w-1 shrink-0 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors bg-gray-800"
      onPointerDown={onPointerDown}
    />
  );
}

export default function App() {
  const selectedTraceId = useStore((s) => s.selectedTraceId);
  const traceRuns = useStore((s) => s.traceRuns);

  const left = useDragResize(INIT_LEFT, MIN_LEFT, 'left');
  const right = useDragResize(INIT_RIGHT, MIN_RIGHT, 'right');

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
        <HeaderStats />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Column 1: Trace List */}
        <div className="shrink-0 overflow-y-auto" style={{ width: left.size }}>
          <TraceList />
        </div>

        <DragHandle onPointerDown={left.onPointerDown} />

        {/* Column 2: Trace Detail (Waterfall + RunTree) */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {selectedTraceId ? (
            <TraceDetail traceId={selectedTraceId} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Select a trace to view details
            </div>
          )}
        </div>

        <DragHandle onPointerDown={right.onPointerDown} />

        {/* Column 3: Run Detail */}
        <div className="shrink-0 overflow-y-auto" style={{ width: right.size }}>
          <RunDetail runs={traceRuns} />
        </div>
      </div>
    </div>
  );
}

function HeaderStats() {
  return (
    <div className="hidden md:block">
      <StatsPanel />
    </div>
  );
}
