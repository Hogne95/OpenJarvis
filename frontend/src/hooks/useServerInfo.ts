import { useState, useEffect } from 'react';
import type { ServerInfo } from '../types';
import { fetchServerInfo } from '../api/client';

export function useServerInfo() {
  const [info, setInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    fetchServerInfo()
      .then(setInfo)
      .catch(() => {});
  }, []);

  return info;
}
