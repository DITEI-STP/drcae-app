import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'auto' | 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem('drcae_theme') as ThemeMode) || 'auto';
  });

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    localStorage.setItem('drcae_theme', newTheme);
  };

  useEffect(() => {
    const applyTheme = () => {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (theme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', systemDark);
      }
    };

    applyTheme();

    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => {
        document.documentElement.classList.toggle('dark', e.matches);
      };
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
