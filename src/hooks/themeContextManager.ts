
'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const defaultInitialTheme: Theme = 'light';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [currentTheme, setCurrentThemeState] = useState<Theme>(defaultInitialTheme); // Initialize with default
  const [mounted, setMounted] = useState(false);

  // Effect to set initial theme from localStorage or system preference ONCE
  useEffect(() => {
    setMounted(true); // Mark as mounted first
    let initialTheme = defaultInitialTheme;
    try {
      const storedTheme = localStorage.getItem('theme') as Theme | null;
      if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) {
        initialTheme = storedTheme;
      } else {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        initialTheme = systemPrefersDark ? 'dark' : 'light';
      }
    } catch (error) {
      console.warn('ThemeProvider: Could not access localStorage to get theme. Defaulting theme.');
    }
    setCurrentThemeState(initialTheme); // This will trigger a re-render if different from default
  }, []); // Empty dependency array: runs only on mount

  // Effect to update HTML class and localStorage when theme changes
  useEffect(() => {
    if (mounted) { // Only run if mounted
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(currentTheme);
      try {
        localStorage.setItem('theme', currentTheme);
      } catch (error) {
        console.warn('ThemeProvider: Could not save theme to localStorage.');
      }
    }
  }, [currentTheme, mounted]); // Runs when currentTheme or mounted changes

  const setThemeCallback = useCallback((theme: Theme) => {
    setCurrentThemeState(theme);
  }, []);

  const toggleThemeCallback = useCallback(() => {
    setCurrentThemeState(prevTheme =>
      prevTheme === 'light' ? 'dark' : 'light' // Simpler toggle
    );
  }, []);

  const providerValue: ThemeContextType = useMemo(() => {
    return {
      theme: currentTheme, // currentTheme is always a Theme type here
      setTheme: setThemeCallback,
      toggleTheme: toggleThemeCallback,
    };
  }, [currentTheme, setThemeCallback, toggleThemeCallback]);

  // Handle SSR or initial client render before theme is determined from localStorage.
  // When not mounted, return children directly. useTheme hook will provide defaults.
  // This avoids hydration mismatches and potential parsing errors with the Provider.
  if (!mounted) {
    return <>{children}</>;
  }

  // This is the main render path once mounted and theme is determined.
  // The `providerValue` is guaranteed to be a valid `ThemeContextType` object.
  return (
    <ThemeContext.Provider value={providerValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    // This fallback is crucial for SSR and when the provider isn't fully ready
    // (e.g., when ThemeProvider returns children directly during the !mounted phase).
    return {
        theme: defaultInitialTheme,
        setTheme: () => {
            // console.warn("setTheme called on ThemeContext with default fallback values.");
        },
        toggleTheme: () => {
            // console.warn("toggleTheme called on ThemeContext with default fallback values.");
        },
    };
  }
  return context;
};
