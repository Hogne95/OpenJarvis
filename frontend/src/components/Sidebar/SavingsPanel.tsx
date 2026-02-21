import type { SavingsData } from '../../types';

interface SavingsPanelProps {
  savings: SavingsData | null;
  localModel?: string;
}

function formatDollars(n: number): string {
  if (n >= 1) return '$' + n.toFixed(2);
  if (n > 0) return '$' + n.toFixed(4);
  return '$0.00';
}

function formatJoules(joules: number): string {
  if (joules >= 1e6) return (joules / 1e6).toFixed(1) + ' MJ';
  if (joules >= 1000) return (joules / 1000).toFixed(1) + ' kJ';
  if (joules >= 1) return joules.toFixed(0) + ' J';
  return '0 J';
}

function formatFlops(n: number): string {
  if (n >= 1e15) return (n / 1e15).toFixed(1) + ' PF';
  if (n >= 1e12) return (n / 1e12).toFixed(1) + ' TF';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GF';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MF';
  return n.toFixed(0) + ' F';
}

export function SavingsPanel({ savings, localModel }: SavingsPanelProps) {
  if (!savings) return null;

  // Use max savings across providers as the headline
  const maxSavings = savings.per_provider.reduce(
    (max, p) => (p.total_cost > max ? p.total_cost : max),
    0,
  );

  // Average energy/flops across providers
  const avgJoules = savings.per_provider.reduce(
    (sum, p) => sum + p.energy_joules,
    0,
  ) / (savings.per_provider.length || 1);

  const avgFlops = savings.per_provider.reduce(
    (sum, p) => sum + p.flops,
    0,
  ) / (savings.per_provider.length || 1);

  // Cloud model labels for comparison
  const cloudModels = savings.per_provider.map((p) => p.label);

  return (
    <div className="savings-panel">
      <h3>Savings vs Cloud</h3>
      <div className="savings-models">
        <div className="savings-model-card local">
          <span className="savings-model-card-label">LOCAL</span>
          <span className="savings-model-card-name">{localModel || 'local model'}</span>
        </div>
        <div className="savings-model-card cloud">
          <span className="savings-model-card-label">CLOUD</span>
          <span className="savings-model-card-name">{cloudModels.join(', ')}</span>
        </div>
      </div>
      <div className="savings-grid">
        <div className="savings-item calls">
          <div className="savings-label">Requests</div>
          <div className="savings-value">{savings.total_calls.toLocaleString()}</div>
        </div>
        <div className="savings-item">
          <div className="savings-label">$ Saved</div>
          <div className="savings-value">{formatDollars(maxSavings)}</div>
        </div>
        <div className="savings-item">
          <div className="savings-label">Energy</div>
          <div className="savings-value">{formatJoules(avgJoules)}</div>
        </div>
        <div className="savings-item">
          <div className="savings-label">FLOPs</div>
          <div className="savings-value">{formatFlops(avgFlops)}</div>
        </div>
      </div>
    </div>
  );
}
