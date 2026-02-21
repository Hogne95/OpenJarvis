import { useState, useEffect, useCallback } from 'react';
import type { SavingsData } from '../types';
import { fetchSavings } from '../api/client';

export function useSavings() {
  const [savings, setSavings] = useState<SavingsData | null>(null);

  const refresh = useCallback(() => {
    fetchSavings()
      .then(setSavings)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { savings, refresh };
}
