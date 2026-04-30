import { useState } from 'react';
import type { CSSProperties } from 'react';
import { getBase } from '../../lib/api';
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

const ACCEPTED_EXTENSIONS = '.txt,.md,.pdf,.docx,.csv,.tsv,.xlsx,.pptx';

export function UploadForm({ onDone }: { onDone?: () => void }) {
  const [tab, setTab] = useState<'paste' | 'upload'>('paste');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const handlePaste = async () => {
    if (!content.trim()) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const res = await fetch(`${getBase()}/v1/connectors/upload/ingest`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `Upload failed: ${res.status}`);
      }
      const data = await res.json();
      setResult(`Added ${data.chunks_added} chunk${data.chunks_added !== 1 ? 's' : ''} to knowledge base`);
      setTitle('');
      setContent('');
      onDone?.();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const formData = new FormData();
      for (const file of files) formData.append('files', file);
      if (title.trim()) formData.append('title', title.trim());

      const res = await fetch(`${getBase()}/v1/connectors/upload/ingest/files`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `Upload failed: ${res.status}`);
      }
      const data = await res.json();
      setResult(`Added ${data.chunks_added} chunk${data.chunks_added !== 1 ? 's' : ''} from ${files.length} file${files.length !== 1 ? 's' : ''}`);
      setFiles([]);
      setTitle('');
      onDone?.();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const tabStyle = (active: boolean): CSSProperties => ({
    flex: 1,
    padding: '6px 0',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    background: active ? '#7c3aed' : 'transparent',
    color: active ? 'white' : 'var(--color-text-secondary)',
    border: 'none',
    borderRadius: 4,
  });

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    color: 'var(--color-text)',
    fontSize: 12,
    marginBottom: 6,
    boxSizing: 'border-box',
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, background: 'var(--color-bg)', borderRadius: 6, padding: 2 }}>
        <button style={tabStyle(tab === 'paste')} onClick={() => setTab('paste')}>
          Paste Text
        </button>
        <button style={tabStyle(tab === 'upload')} onClick={() => setTab('upload')}>
          Upload Files
        </button>
      </div>

      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title (optional)" style={inputStyle} />

      {tab === 'paste' && (
        <>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Paste your text here..."
            rows={6}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', minHeight: 100 }}
          />
          <button
            onClick={handlePaste}
            disabled={busy || !content.trim()}
            style={{
              width: '100%',
              padding: 8,
              background: busy || !content.trim() ? '#444' : '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {busy ? 'Adding...' : 'Add to Knowledge Base'}
          </button>
        </>
      )}

      {tab === 'upload' && (
        <>
          <input
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            onChange={(event) => setFiles(Array.from(event.target.files || []))}
            style={{ ...inputStyle, padding: 6 }}
          />
          {files.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {files.map((file) => file.name).join(', ')}
            </div>
          )}
          <button
            onClick={handleUpload}
            disabled={busy || files.length === 0}
            style={{
              width: '100%',
              padding: 8,
              background: busy || files.length === 0 ? '#444' : '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {busy ? 'Uploading...' : 'Upload & Index'}
          </button>
        </>
      )}

      {result && <div style={{ fontSize: 12, color: '#4ade80', marginTop: 8 }}>{result}</div>}
      {error && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
