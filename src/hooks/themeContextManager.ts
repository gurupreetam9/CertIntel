
'use client';

import React, { type ReactNode, createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Create the context with a default value.
const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [currentTheme, setCurrentThemeInternal] = React.useState<Theme>('light');

  // Effect for initial theme load from localStorage or system preference (client-side only)
  React.useEffect(() => {
    let initialTheme: Theme = 'light'; // Default
    try {
      const storedTheme = localStorage.getItem('theme') as Theme | null;
      if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) {
        initialTheme = storedTheme;
      } else {
        // If no theme in localStorage, check system preference
        initialTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    } catch (e) {
      console.warn('Could not access localStorage for theme preference. Using system preference.', e);
      // Ensure window.matchMedia is available (it should be in client-side useEffect)
      if (typeof window !== 'undefined' && window.matchMedia) {
        initialTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    }
    setCurrentThemeInternal(initialTheme);
  }, []); // Empty dependency array ensures this runs once on mount (client-side)

  // Effect to apply the current theme to the DOM and handle cross-tab synchronization
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(currentTheme);

      const handleStorageChange = (event: StorageEvent) => {
        if (event.key === 'theme') {
          const newThemeValue = event.newValue as Theme | null;
          if (newThemeValue && (newThemeValue === 'light' || newThemeValue === 'dark') && newThemeValue !== currentTheme) {
            setCurrentThemeInternal(newThemeValue);
          }
        }
      };
      window.addEventListener('storage', handleStorageChange);

      return () => {
        window.removeEventListener('storage', handleStorageChange);
      };
    }
  }, [currentTheme]);

  const setTheme = React.useCallback((newTheme: Theme) => {
    if (newTheme === 'light' || newTheme === 'dark') {
      setCurrentThemeInternal(newTheme);
      try {
        localStorage.setItem('theme', newTheme);
      } catch (e) {
        console.warn('Could not save theme to localStorage:', e);
      }
    }
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme(currentTheme === 'light' ? 'dark' : 'light');
  }, [currentTheme, setTheme]);

  const themeContextData = React.useMemo(() => ({
    theme: currentTheme,
    setTheme,
    toggleTheme,
  }), [currentTheme, setTheme, toggleTheme]);

  return (
    <ThemeContext.Provider value={themeContextData}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = React.useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
