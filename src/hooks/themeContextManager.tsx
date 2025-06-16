
'use client';

import React, { createContext, useContext, type ReactNode, useEffect, useMemo, useCallback } from 'react';

type Theme = 'light'; // Theme is always 'light'

// Define the context type
interface CertIntelThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Create the context with a concrete default value matching the type.
const defaultContextValue: CertIntelThemeContextType = {
  theme: 'light',
  setTheme: () => { /* no-op for static theme */ },
  toggleTheme: () => { /* no-op for static theme */ },
};

const CertIntelThemeContext = createContext<CertIntelThemeContextType>(defaultContextValue);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const staticTheme: Theme = 'light';

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark'); // Ensure dark is not set
    root.classList.add(staticTheme);
  }, [staticTheme]); // staticTheme won't change, so this runs once on mount.

  // Memoize no-op functions for stability
  const stableSetTheme = useCallback((_newTheme: Theme) => {
    // console.warn('setTheme called, but theme is static and locked to "light".');
  }, []);

  const stableToggleTheme = useCallback(() => {
    // console.warn('toggleTheme called, but theme is static and locked to "light".');
  }, []);

  // Memoize the context provider value
  const providerValue = useMemo(() => ({
    theme: staticTheme,
    setTheme: stableSetTheme,
    toggleTheme: stableToggleTheme,
  }), [staticTheme, stableSetTheme, stableToggleTheme]); // Dependencies for useMemo

  return (
    <CertIntelThemeContext.Provider value={providerValue}>
      {children}
    </CertIntelThemeContext.Provider>
  );
};

// Custom hook to use the theme context
export const useTheme = (): CertIntelThemeContextType => {
  const context = useContext(CertIntelThemeContext);
  if (context === undefined) {
    // This check is good practice.
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
