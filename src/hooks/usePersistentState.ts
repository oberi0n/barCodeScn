import { useEffect, useState } from 'react';

export function usePersistentState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    const saved = window.localStorage.getItem(key);
    if (saved) {
      try {
        return JSON.parse(saved) as T;
      } catch (error) {
        console.warn('Failed to parse state from localStorage', error);
      }
    }
    return defaultValue;
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}
