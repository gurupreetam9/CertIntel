
'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Default context value
const defaultContextValue: ThemeContextType = {
  theme: 'light',
  setTheme: (theme: Theme) => {
    console.warn('ThemeProvider not found: setTheme called outside provider with theme:', theme);
  },
  toggleTheme: () => {
    console.warn('ThemeProvider not found: toggleTheme called outside provider');
  },
};

const ThemeContext = createContext<ThemeContextType>(defaultContextValue);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [theme, setThemeInternal] = useState<Theme>(() => {
    // Initialize theme on the client side only
    if (typeof window !== 'undefined') {
      try {
        const storedTheme = localStorage.getItem('theme') as Theme | null;
        if (storedTheme === 'light' || storedTheme === 'dark') {
          return storedTheme;
        }
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return prefersDark ? 'dark' : 'light';
      } catch (error) {
        console.error("Error accessing localStorage for theme initialization:", error);
        // Fallback to system preference if localStorage access fails
        if (typeof window.matchMedia === 'function') {
           const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
           return prefersDark ? 'dark' : 'light';
        }
      }
    }
    return 'light'; // Default server-side or if window is undefined
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
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
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    if (newTheme === 'light' || newTheme === 'dark') {
      setThemeInternal(newTheme);
    } else {
      console.warn(`Attempted to set invalid theme: ${newTheme}`);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeInternal((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  }, []);

  // Inlining the context value directly for diagnostic purposes
  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === defaultContextValue && process.env.NODE_ENV !== 'production') {
    // This warning might appear if the component using useTheme renders before ThemeProvider is fully initialized
    // For now, it's a safety check.
    // console.warn('useTheme might be used outside of a fully initialized ThemeProvider. Check component tree.');
  }
  return context;
};
