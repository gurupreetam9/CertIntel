
'use client';

import React, { createContext, useContext, type ReactNode, useEffect, useCallback, useMemo } from 'react';

type Theme = 'light'; // Theme is always 'light'

// Define the context type
interface AppThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void; // Kept for type consistency, even if no-op
  toggleTheme: () => void; // Kept for type consistency, even if no-op
}

// Create the context with a concrete default value matching the type.
const defaultContextValue: AppThemeContextType = {
  theme: 'light',
  setTheme: () => {
    // Default no-op.
  },
  toggleTheme: () => {
    // Default no-op.
  },
};

const AppThemeContext = createContext<AppThemeContextType>(defaultContextValue);

// Define the provider component
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const staticTheme: Theme = 'light';

  // Define stable no-op functions for setTheme and toggleTheme
  const stableSetTheme = useCallback((_newTheme: Theme) => {
    // console.warn('ThemeProvider: setTheme called, but theme is static ("light").');
  }, []);

  const stableToggleTheme = useCallback(() => {
    // console.warn('ThemeProvider: toggleTheme called, but theme is static ("light").');
  }, []);

  useEffect(() => {
    // Apply the static theme to the document
    const root = window.document.documentElement;
    root.classList.remove('dark'); // Ensure dark is not set
    root.classList.add(staticTheme);
  }, [staticTheme]); // staticTheme won't change, so this runs once on mount.

  // Memoize the context value to ensure it's stable
  const providerValue = useMemo<AppThemeContextType>(() => ({
    theme: staticTheme,
    setTheme: stableSetTheme,
    toggleTheme: stableToggleTheme,
  }), [staticTheme, stableSetTheme, stableToggleTheme]); // Dependencies for useMemo

  return (
    <AppThemeContext.Provider value={providerValue}>
      {children}
    </AppThemeContext.Provider>
  );
};

// Custom hook to use the theme context
export const useTheme = (): AppThemeContextType => {
  const context = useContext(AppThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
