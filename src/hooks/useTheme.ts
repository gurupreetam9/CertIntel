
'use client';

import { createContext, useContext, useEffect, useState, type ReactNode, useMemo } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const defaultContextValue: ThemeContextType = {
  theme: 'light',
  setTheme: () => console.warn('ThemeProvider not found or not yet initialized'),
  toggleTheme: () => console.warn('ThemeProvider not found or not yet initialized'),
};

const ThemeContext = createContext<ThemeContextType>(defaultContextValue);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeInternal] = useState<Theme>(() => {
    // Initializer function for useState to ensure this logic runs only once
    if (typeof window === 'undefined') {
      return 'light'; // Default for SSR or environments without window
    }
    try {
      const storedTheme = localStorage.getItem('theme') as Theme | null;
      if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) {
        return storedTheme;
      }
      // Fallback to system preference if no stored theme
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (error) {
      console.error("Error accessing localStorage during initial theme setup:", error);
      // Fallback safely if localStorage is unavailable
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  });

  useEffect(() => {
    // This effect runs when the theme state changes, to update the DOM and localStorage
    if (typeof window !== 'undefined') { // Ensure this only runs client-side
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      try {
        localStorage.setItem('theme', theme);
      } catch (error) {
        console.error("Error setting theme in localStorage:", error);
      }
    }
  }, [theme]); // Rerun only when theme changes

  const setTheme = (newTheme: Theme) => {
    if (newTheme === 'light' || newTheme === 'dark') {
      setThemeInternal(newTheme);
    }
  };

  const toggleTheme = () => {
    setThemeInternal((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  // Memoize the context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo(() => ({
    theme,
    setTheme,
    toggleTheme,
  }), [theme]); // `setTheme` and `toggleTheme` are stable due to how setThemeInternal is defined

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  // This check is mainly for development feedback if the hook is used improperly.
  if (context === defaultContextValue && typeof window !== 'undefined' ) {
    // console.warn('useTheme() hook used outside of a ThemeProvider or ThemeProvider has not fully initialized.');
  }
  return context;
};
