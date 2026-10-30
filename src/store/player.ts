'use client';
import { create } from 'zustand';
import type { EpisodeView } from '@/lib/db';

export interface PlayerState {
  current: EpisodeView | null;
  playing: boolean;
  buffering: boolean;
  positionSec: number;
  durationSec: number;
  rate: number;
  sleepEndsAt: number | null;
  error: string | null;
  open: boolean;
  set: (patch: Partial<Omit<PlayerState, 'set'>>) => void;
}
export const usePlayer = create<PlayerState>((set) => ({
  current: null, playing: false, buffering: false, positionSec: 0, durationSec: 0, rate: 1, sleepEndsAt: null, error: null, open: false,
  set: (patch) => set(patch),
}));
