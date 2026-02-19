import { create } from 'zustand';

const API_BASE = import.meta.env.DEV ? '' : '/ui/..';

export const useStore = create((set, get) => ({
  selectedTraceId: null,
  setSelectedTraceId: (id) => set({ selectedTraceId: id }),
  liveCount: 0,
  setLiveCount: (n) => set({ liveCount: n }),
}));

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}
