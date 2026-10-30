'use client';
import { create } from 'zustand';
export const useTick = create<{ tick: number; bump: () => void }>((set) => ({ tick: 0, bump: () => set((s) => ({ tick: s.tick + 1 })) }));
