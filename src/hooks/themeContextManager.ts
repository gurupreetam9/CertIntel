
'use client';

import React, { createContext, useContext, type ReactNode, useEffect } from 'react';

type Theme = 'light'; // Theme is always 'light'

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Default context value
const defaultThemeContextValue: ThemeContextType = {
  theme: 'light',
  setTheme: () => {
    // console.warn('setTheme called, but theme switching is disabled.');
  },
  toggleTheme: () => {
    // console.warn('toggleTheme called, but theme switching is disabled.');
  },
};

const ThemeContext = createContext<ThemeContextType>(defaultThemeContextValue);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const staticTheme: Theme = 'light';

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark'); // Ensure dark mode is off
    root.classList.add(staticTheme); // Add 'light' class
  }, [staticTheme]); // staticTheme won't change, so this runs once on mount.

  return (
    <ThemeContext.Provider value={{
      theme: staticTheme,
      setTheme: () => {
        // console.warn('setTheme called, but theme is static and locked to "light".');
      },
      toggleTheme: () => {
        // console.warn('toggleTheme called, but theme is static and locked to "light".');
      },
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    // This should ideally not happen if ThemeProvider wraps the app.
    // console.error('useTheme must be used within a ThemeProvider. Falling back to default.');
    return defaultThemeContextValue;
  }
  return context;
};
