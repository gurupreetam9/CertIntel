
'use client';

import React, { createContext, useContext, type ReactNode, useEffect } from 'react';

// Since dark mode is removed, theme is always 'light'.
type Theme = 'light';

interface ThemeContextType {
  theme: Theme;
  // No-op functions as theme switching is removed
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Default (and only) theme context value
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
  // Apply 'light' class to the documentElement on mount for consistency,
  // though it might not be strictly necessary if all dark mode CSS is removed.
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  }, []);

  // Extremely simplified ThemeProvider for diagnostic purposes.
  // It no longer provides the ThemeContext.Provider itself,
  // so useTheme will fall back to defaultThemeContextValue.
  // The <React.Fragment> that previously caused errors is also removed.
  return children;
};

export const useTheme = (): ThemeContextType => {
  // useContext will return defaultThemeContextValue as ThemeProvider
  // no longer wraps children with ThemeContext.Provider.
  // Or, if somehow ThemeContext.Provider is used higher up, it would get that.
  // For robustness, ensure it always returns a valid structure.
  const context = useContext(ThemeContext);
  return context || defaultThemeContextValue;
};
