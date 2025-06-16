
'use client';

import React, { createContext, useContext, type ReactNode, useEffect, useMemo, useCallback } from 'react';

type Theme = 'light'; // Theme is always 'light'

// Define the context type
interface CertIntelThemeContextType {
  theme: Theme;
  // Even if static, including them as no-ops can satisfy some tooling or type checks
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
    // Apply the static theme to the document
    const root = window.document.documentElement;
    root.classList.remove('dark'); // Ensure dark is not set
    root.classList.add(staticTheme);
    // Optionally, set a data attribute as well if needed for more specific CSS targeting
    // root.setAttribute('data-theme', staticTheme);
  }, [staticTheme]); // staticTheme won't change, so this runs once on mount.

  // Memoize no-op functions for stability if passed in context
  const stableSetTheme = useCallback((_newTheme: Theme) => {
    // Theme is static and locked to "light". This function is a no-op.
    // console.warn('setTheme called, but theme is static and locked to "light".');
  }, []);

  const stableToggleTheme = useCallback(() => {
    // Theme is static and locked to "light". This function is a no-op.
    // console.warn('toggleTheme called, but theme is static and locked to "light".');
  }, []);

  // Memoize the context provider value to ensure stable reference
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
