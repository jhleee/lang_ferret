import { create } from 'zustand';

const API_BASE = import.meta.env.DEV ? '' : '/ui/..';

export const useStore = create((set, get) => ({
  selectedTraceId: null,
  setSelectedTraceId: (id) => set({ selectedTraceId: id, selectedRunId: null, traceRuns: [] }),
  selectedRunId: null,
  setSelectedRunId: (id) => set({ selectedRunId: id }),
  traceRuns: [],
  setTraceRuns: (runs) => set({ traceRuns: runs }),
  liveCount: 0,
  setLiveCount: (n) => set({ liveCount: n }),
}));

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}
