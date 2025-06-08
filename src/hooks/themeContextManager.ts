
'use client';

import React, { type ReactNode } from 'react';

type Theme = 'light' | 'dark';

// Extremely simplified context type for diagnostics
interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void; // Will be a no-op
}

// Default context value that matches the simplified type
const defaultStaticContextValue: ThemeContextType = {
  theme: 'light', // Fixed theme
  setTheme: () => {
    // This is a no-op in this extremely simplified version for diagnostics
    if (process.env.NODE_ENV === 'development') {
      console.log("Simplified ThemeProvider: setTheme called (no-op for diagnostics). Theme is fixed to light.");
    }
  },
};

// Renamed context for diagnostics
const AppThemeContext = React.createContext<ThemeContextType>(defaultStaticContextValue);

interface ThemeProviderProps {
  children: ReactNode;
}

// ThemeProvider will now be a simple pass-through.
// The actual Provider component that was causing parsing errors is removed.
export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  // The problematic <AppThemeContext.Provider value={...}> line is removed
  // to see if the app can parse and build without it.
  // We're simply returning children, meaning no actual context is being provided
  // by *this* component anymore in a way that uses the dynamic <Provider>.
  // The useTheme hook below will rely on the default value of AppThemeContext.
  if (process.env.NODE_ENV === 'development') {
    console.log("Simplified ThemeProvider: Rendering children directly. No dynamic Provider. Theme is fixed to light.");
  }
  return <>{children}</>;
};

export const useTheme = (): ThemeContextType => {
  // Returns a fixed value, not interacting with a complex provider.
  // This ensures that components using useTheme() don't break,
  // but they will always get the 'light' theme.
  const context = React.useContext(AppThemeContext);
  // If context is somehow undefined (shouldn't happen with a default in createContext)
  // return the static default to be safe.
  return context || defaultStaticContextValue;
};

