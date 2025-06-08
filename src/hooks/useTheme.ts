
'use client';

import React, { type ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface MyThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Define a default context value that matches the type
const defaultMyThemeContextValue: MyThemeContextType = {
  theme: 'light',
  setTheme: (newTheme: Theme) => {
    // This function should ideally not be called if the provider is correctly set up.
    // console.warn(
    //   'MyThemeProvider not found or not initialized: setTheme called on default context with theme:',
    //   newTheme
    // );
  },
  toggleTheme: () => {
    // console.warn(
    //   'MyThemeProvider not found or not initialized: toggleTheme called on default context'
    // );
  },
};

const MyThemeContext = React.createContext<MyThemeContextType>(defaultMyThemeContextValue);

interface MyThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: MyThemeProviderProps) => {
  const [currentTheme, setCurrentThemeInternal] = React.useState<Theme>('light');

  // Effect for initial theme setting from localStorage or system preference
  React.useEffect(() => {
    let initialTheme: Theme = 'light';
    if (typeof window !== 'undefined') {
      try {
        const storedTheme = localStorage.getItem('theme') as Theme | null;
        if (storedTheme === 'light' || storedTheme === 'dark') {
          initialTheme = storedTheme;
        } else {
          const prefersDark = window.matchMedia(
            '(prefers-color-scheme: dark)'
          ).matches;
          initialTheme = prefersDark ? 'dark' : 'light';
        }
      } catch (error) {
        // console.error(
        //   'Error accessing localStorage for theme initialization:',
        //   error
        // );
        // Fallback to system preference if localStorage fails
        if (typeof window.matchMedia === 'function') {
          const prefersDark = window.matchMedia(
            '(prefers-color-scheme: dark)'
          ).matches;
          initialTheme = prefersDark ? 'dark' : 'light';
        }
      }
    }
    setCurrentThemeInternal(initialTheme);
  }, []); // Empty dependency array ensures this runs once on mount

  // Effect for applying theme class to HTML element and saving to localStorage
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      if (currentTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      try {
        localStorage.setItem('theme', currentTheme);
      } catch (error) {
        // console.error('Error setting theme in localStorage:', error);
      }
    }
  }, [currentTheme]);

  const handleSetTheme = React.useCallback((newTheme: Theme) => {
    if (newTheme === 'light' || newTheme === 'dark') {
      setCurrentThemeInternal(newTheme);
    } else {
      // console.warn(
      //   `Attempted to set invalid theme: ${newTheme}. Allowed themes are 'light' or 'dark'.`
      // );
    }
  }, []);

  const handleToggleTheme = React.useCallback(() => {
    setCurrentThemeInternal((prevTheme) =>
      prevTheme === 'light' ? 'dark' : 'light'
    );
  }, []);

  const providerDynamicValue = React.useMemo(
    () => ({
      theme: currentTheme,
      setTheme: handleSetTheme,
      toggleTheme: handleToggleTheme,
    }),
    [currentTheme, handleSetTheme, handleToggleTheme]
  );

  return (
    <MyThemeContext.Provider value={providerDynamicValue}>
      {children}
    </MyThemeContext.Provider>
  );
};

export const useTheme = (): MyThemeContextType => {
  const context = React.useContext(MyThemeContext);
  // Check if the context is still the default value, which might indicate misuse
  if (context === defaultMyThemeContextValue && process.env.NODE_ENV !== 'production') {
    // This warning helps catch if useTheme is used outside a ThemeProvider.
    // console.warn('useTheme hook used outside of a ThemeProvider or ThemeProvider not fully initialized. Using default theme values.');
  }
  return context;
};
