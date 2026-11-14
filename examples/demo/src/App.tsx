import { lazy, Suspense, useEffect, useState } from 'react';
import { Sigil } from 'sigilsmith/react';
import { setMediaSessionArtwork } from 'sigilsmith/targets';
import { useDemo, type Row } from './store';

const Settings = lazy(() => import('./Settings'));

function RowView({ row }: { row: Row }) {
  const rename = useDemo((s) => s.rename);
  const [editing, setEditing] = useState(false);
  const label = String(row.item.title ?? row.item.name ?? row.item.id);
  const [draft, setDraft] = useState(label);
  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft !== label) void rename(String(row.item.id), draft.trim());
  };
  return (
    <li className="row">
      <Sigil item={row.item} record={row.record} size={44} />
      <div className="meta">
        {editing ? (
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} aria-label="New title" />
        ) : (
          <span className="title">{label}</span>
        )}
        <span className="type">{String(row.item.type)}{row.record?.url ? ' · stored' : ''}{row.record?.frozen ? ' · kept' : ''}</span>
      </div>
      <button type="button" onClick={() => setEditing(true)}>Rename</button>
      {row.item.type === 'song' && row.record ? (
        <button type="button" onClick={() => setMediaSessionArtwork({ title: label, artist: String(row.item.artist ?? '') }, row.record!)}>Play</button>
      ) : null}
    </li>
  );
}

export default function App() {
  const { rows, prompt, materialize, answer } = useDemo();
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => {
    void materialize();
  }, [materialize]);
  return (
    <main>
      <header>
        <h1>sigilsmith demo</h1>
        <button type="button" aria-expanded={showSettings} onClick={() => setShowSettings((v) => !v)}>
          {showSettings ? 'Close settings' : 'Thumbnail settings'}
        </button>
      </header>
      <p className="hint">Videos use rings, songs mix emoji and shapes (per item, stable), users get initials, the podcast uses a slow mock AI generator behind an instant placeholder. Rename a song to see the regeneration prompt.</p>
      {showSettings ? (
        <Suspense fallback={<p aria-busy="true">Loading settings…</p>}>
          <Settings />
        </Suspense>
      ) : null}
      <ul className="list">{rows.map((r) => <RowView key={String(r.item.id)} row={r} />)}</ul>
      <div role="status" aria-live="polite" className="toast-region">
        {prompt ? (
          <div className="toast">
            <span>Image kept for “{prompt.title}”. Update it to match the new title?</span>
            <button type="button" onClick={() => answer('update')}>Update</button>
            <button type="button" onClick={() => answer('keep')}>Keep</button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
