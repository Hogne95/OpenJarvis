import { useState, useEffect } from 'react';
import type { ModelInfo } from '../types';
import { fetchModels } from '../api/client';

export function useModels() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchModels()
      .then(setModels)
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, []);

  return { models, loading };
}
