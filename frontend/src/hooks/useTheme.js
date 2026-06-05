import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'theme';
const LIGHT = 'light';
const DARK = 'dark';

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || DARK;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 初始化时立即应用
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) || DARK;
    document.documentElement.setAttribute('data-theme', saved);
    setTheme(saved);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === LIGHT ? DARK : LIGHT;
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
  }, []);

  return { theme, toggleTheme, isDark: theme === DARK };
}
