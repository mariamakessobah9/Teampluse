import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { colorScheme } from 'nativewind';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'theme-mode';

interface ThemeState {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
  loadTheme: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'light',

  setTheme: async (mode) => {
    set({ theme: mode });
    colorScheme.set(mode);
    await SecureStore.setItemAsync(STORAGE_KEY, mode);
  },

  toggleTheme: async () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    await get().setTheme(next);
  },

  loadTheme: async () => {
    const stored = (await SecureStore.getItemAsync(STORAGE_KEY)) as
      | ThemeMode
      | null;
    const initial: ThemeMode = stored === 'dark' ? 'dark' : 'light';
    set({ theme: initial });
    colorScheme.set(initial);
  },
}));
