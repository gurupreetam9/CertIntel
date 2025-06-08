
'use client';

import React, { type ReactNode, useState, createContext, useCallback, useMemo, useEffect } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  // toggleTheme: () => void; // Temporarily removed for extreme simplification
}

const defaultContextValue: ThemeContextType = {
  theme: 'light',
  setTheme: () => {
    // console.warn('ThemeProvider default setTheme called');
  },
  // toggleTheme: () => {
  //   // console.warn('ThemeProvider default toggleTheme called');
  // },
};

const ThemeContext = createContext<ThemeContextType>(defaultContextValue);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  // For extreme simplicity, the theme is fixed and setTheme is a no-op
  const staticTheme: Theme = 'light';
  
  const noOpSetTheme = (newTheme: Theme) => {
    // This function does nothing in this simplified version.
    // Its presence is to satisfy the ThemeContextType.
    // console.log(`setTheme called with ${newTheme}, but is currently a no-op.`);
  };

  // The context value is now extremely simple
  const contextValue: ThemeContextType = {
    theme: staticTheme,
    setTheme: noOpSetTheme,
  };

  // console.log('ThemeProvider (extremely simplified) rendering. Context value:', contextValue);

  // The problematic line has been here previously.
  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = React.useContext(ThemeContext);
  if (context === defaultContextValue && process.env.NODE_ENV !== 'production') {
    // This warning indicates useTheme might be used outside of its Provider
    // or the provider itself hasn't fully initialized its value (less likely with this simplification).
    // console.warn('useTheme is consuming the defaultContextValue. Ensure it is used within a ThemeProvider that has properly initialized.');
  }
  return context;
};
