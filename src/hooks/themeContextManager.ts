
'use client';

import React, { type ReactNode } from 'react';

type Theme = 'light' | 'dark';

// Interface for the context value
interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// This is a static, hardcoded value for the simplified hooks.
const staticDiagnosticContextValue: ThemeContextType = {
  theme: 'light',
  setTheme: (theme: Theme) => {
    console.log('Simplified setTheme (no-op) called with:', theme);
  },
  toggleTheme: () => {
    console.log('Simplified toggleTheme (no-op) called.');
  },
};

// ThemeProvider component (Extremely Simplified for Diagnostics)
// It no longer uses ThemeContext.Provider
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  if (process.env.NODE_ENV === 'development') {
    console.log("ThemeProvider (Extremely Simplified): Rendering children directly. No actual context provider. Theme is fixed to 'light' via useTheme hook.");
  }
  // The problematic <ThemeContext.Provider> line is removed.
  // And now, fragments are removed too.
  return children;
};

// useTheme hook (Extremely Simplified for Diagnostics)
// It returns the static diagnostic value.
export const useTheme = (): ThemeContextType => {
  if (process.env.NODE_ENV === 'development') {
    // console.log('useTheme (Extremely Simplified): Returning static diagnostic value.');
  }
  return staticDiagnosticContextValue;
};
