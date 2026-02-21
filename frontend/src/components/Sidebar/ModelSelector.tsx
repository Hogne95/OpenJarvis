import type { ModelInfo } from '../../types';

interface ModelSelectorProps {
  models: ModelInfo[];
  selected: string;
  onSelect: (model: string) => void;
}

export function ModelSelector({ models, selected, onSelect }: ModelSelectorProps) {
  return (
    <div className="model-selector">
      <label htmlFor="model-select">Model</label>
      <select
        id="model-select"
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
      >
        {models.length === 0 && (
          <option value="">No models available</option>
        )}
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.id}
          </option>
        ))}
      </select>
    </div>
  );
}
