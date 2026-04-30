import { useState } from 'react';
import type { ConnectRequest } from '../../types/connectors';

export function InlineConnectForm({
  fields,
  loading,
  onSubmit,
}: {
  fields: Array<{ name: string; placeholder: string; type?: string }>;
  loading: boolean;
  onSubmit: (req: ConnectRequest) => void;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const allFilled = fields.every((field) => inputs[field.name]?.trim());

  const submit = () => {
    const req: ConnectRequest = {};
    for (const field of fields) {
      if (field.name === 'email') req.email = inputs.email;
      else if (field.name === 'password') req.password = inputs.password;
      else if (field.name === 'token') req.token = inputs.token;
      else if (field.name === 'path') req.path = inputs.path;
    }
    if (req.email && req.password) {
      req.token = `${req.email}:${req.password}`;
      req.code = req.token;
    }
    if (req.token && !req.code) req.code = req.token;
    onSubmit(req);
  };

  return (
    <div>
      {fields.map((field) => (
        <input
          key={field.name}
          value={inputs[field.name] || ''}
          onChange={(event) => setInputs((prev) => ({ ...prev, [field.name]: event.target.value }))}
          placeholder={field.placeholder}
          type={field.type || 'text'}
          style={{
            width: '100%',
            padding: '7px 10px',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            color: 'var(--color-text)',
            fontSize: 12,
            marginBottom: 6,
            boxSizing: 'border-box',
          }}
        />
      ))}
      <button
        onClick={submit}
        disabled={loading || !allFilled}
        style={{
          width: '100%',
          padding: 8,
          background: loading || !allFilled ? '#444' : '#7c3aed',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Connect
      </button>
    </div>
  );
}
