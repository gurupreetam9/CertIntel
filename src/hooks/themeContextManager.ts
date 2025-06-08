
'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const defaultInitialTheme: Theme = 'light';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [currentTheme, setCurrentThemeState] = useState<Theme | undefined>(undefined);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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
      console.warn('ThemeProvider: Could not access localStorage. Defaulting theme.');
    }
    setCurrentThemeState(initialTheme);
  }, []);


  useEffect(() => {
    if (mounted && currentTheme) {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(currentTheme);
      try {
        localStorage.setItem('theme', currentTheme);
      } catch (error) {
        console.warn('ThemeProvider: Could not save theme to localStorage.');
      }
    }
  }, [currentTheme, mounted]);

  const providerValue = useMemo(() => {
    const setTheme = (theme: Theme) => {
      if (mounted) {
        setCurrentThemeState(theme);
      }
    };
    const toggleTheme = () => {
      if (mounted) {
        setCurrentThemeState(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
      }
    };
    return {
        theme: currentTheme || defaultInitialTheme, // Fallback to default if currentTheme is undefined
        setTheme,
        toggleTheme,
    };
  }, [currentTheme, mounted]);

  // If on SSR or before theme is determined client-side, provide default values
  // to avoid hydration mismatches. The actual theme class will be applied by useEffect on mount.
  if (typeof window === 'undefined' || !mounted || currentTheme === undefined) {
    // To avoid "Unterminated regexp literal" on </React.Fragment> or </>
    // return children directly. This might cause issues if children is an array.
    return children;
  }

  return (
    <ThemeContext.Provider value={providerValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    // This fallback is primarily for SSR or if useTheme is somehow used outside ThemeProvider,
    // or during the very initial client render before `currentTheme` state is set.
    return {
        theme: defaultInitialTheme,
        setTheme: () => {
            // console.warn("setTheme called on uninitialized context (SSR or outside provider)");
        },
        toggleTheme: () => {
            // console.warn("toggleTheme called on uninitialized context (SSR or outside provider)");
        },
    };
  }
  return context;
};
