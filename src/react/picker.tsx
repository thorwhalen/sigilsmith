/**
 * The picker (exported from `sigilsmith/react`): let a user change one item's image (B6), the piece an app
 * adds when "every item has a generated image" grows into "and you can pick your own".
 *
 * - `useSigilPicker(item, { record, store, candidates, onChange })` is headless: it lists
 *   the choices (the generated sigil, the app's candidate images, the current custom
 *   image), uploads a file through `customFromFile`, adopts a candidate URL through
 *   `adoptImage`, and hands the resulting record (or `null`, back to generated) to
 *   `onChange`, which persists it on the item. Draw it with the app's own components.
 * - `<SigilPicker>` is a plain default rendering of the hook, for apps that do not care.
 *
 * Every press is acknowledged at once: `pending` names the choice being applied (render it
 * `aria-busy`, never natively `disabled`), and repeat presses are ignored until it settles. Errors (a refused upload, a failed save)
 * land in `error`, with the SGS code stripped for display.
 */
import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import { adoptImage, customFromFile, type ImageStore, type SigilRecord } from '../delivery.js';
import type { Sigil as SigilApi } from '../sigil.js';
import type { Item } from '../types.js';
import { Sigil } from './index.js';

/** An image the app offers for this item (a provider's cover art, another item's image). */
export interface SigilCandidate {
  id: string;
  label: string;
  /** A record to reuse as is (an image already stored, e.g. another item's upload). */
  record?: SigilRecord;
  /** Or a URL to adopt (`adoptImage`; copied into `store` when `copy` is set). */
  url?: string;
  copy?: boolean;
  /** Or the app's own way to turn it into a record (e.g. a server-side copy). */
  adopt?: () => Promise<SigilRecord>;
  /** URL shown in the picker before it is picked (default: `url`); for an `adopt`-only candidate. */
  preview?: string;
}

export interface SigilChoice {
  id: string;
  label: string;
  /** The record this choice shows; `null` is the generated sigil. */
  record: SigilRecord | null;
  candidate?: SigilCandidate;
}

export interface UseSigilPickerOptions {
  /** The item's current record (`null`/absent: the generated sigil). */
  record?: SigilRecord | null;
  /** Where uploads (and copied candidates) are stored: the app's `ImageStore` (`fromDataProvider(...)`). */
  store?: ImageStore;
  candidates?: SigilCandidate[];
  /** Persist the new record on the item (`null`: back to the generated sigil). May be async. */
  onChange(record: SigilRecord | null): unknown;
  maxBytes?: number;
  /** Uploads are downscaled in the browser to this longer side first (px; default 512, 0 to keep the file as is). */
  maxSide?: number;
  /** Label of the generated choice. */
  generatedLabel?: string;
}

export interface SigilPickerState {
  choices: SigilChoice[];
  /** Id of the choice the item shows now. */
  current: string;
  /** Id of the choice being applied (`'upload'` for an upload), or null. */
  pending: string | null;
  error: string | null;
  pick(choice: SigilChoice): Promise<void>;
  upload(file: Blob): Promise<void>;
}

const GENERATED = 'generated';
const CURRENT = 'current';

/** The candidate a record shows: one whose record has the same URL, else the one it was made from (`from`). */
function matchCandidate(record: SigilRecord, candidates: SigilCandidate[]): SigilCandidate | undefined {
  const sameUrl = (c: SigilCandidate) => record.url !== undefined && (c.record?.url ?? c.url) === record.url;
  return candidates.find(sameUrl) ?? (record.from ? candidates.find((c) => !c.record && c.id === record.from) : undefined);
}

/** The choices for an item: the generated sigil, the current custom image when no candidate is it, then the candidates. Pure. */
export function pickerChoices(record: SigilRecord | null | undefined, candidates: SigilCandidate[] = [], o: { generatedLabel?: string; currentLabel?: string } = {}): SigilChoice[] {
  const list: SigilChoice[] = [{ id: GENERATED, label: o.generatedLabel ?? 'Generated', record: null }];
  const custom = record?.source === 'custom' ? record : null;
  for (const c of candidates) {
    const shown = c.preview ?? c.url;
    const r = c.record ?? (shown ? ({ source: 'custom', contentId: `preview:${c.id}`, inputsDigest: '', url: shown, frozen: true, origin: 'adopted', from: c.id } as SigilRecord) : null);
    list.push({ id: c.id, label: c.label, record: r, candidate: c });
  }
  if (custom && !matchCandidate(custom, candidates)) list.splice(1, 0, { id: CURRENT, label: o.currentLabel ?? 'Current image', record: custom });
  return list;
}

/** Id of the choice an item's record shows. Pure. */
export function currentChoiceId(choices: SigilChoice[], record: SigilRecord | null | undefined): string {
  if (record?.source !== 'custom') return GENERATED;
  const candidates = choices.flatMap((c) => (c.candidate ? [c.candidate] : []));
  return matchCandidate(record, candidates)?.id ?? CURRENT;
}

/**
 * The record a choice stands for: reused, adopted (copied into `store` when the candidate says
 * `copy`), or the app's own `adopt`. A record made from a candidate carries its id (`from`), so
 * the picker still knows it once its URL is the store's, not the candidate's.
 */
export async function resolveChoice(choice: SigilChoice, o: { store?: ImageStore; maxBytes?: number } = {}): Promise<SigilRecord | null> {
  const c = choice.candidate;
  if (!c) return choice.record;
  if (c.record) return c.record;
  if (c.copy && !c.adopt && !o.store) throw new Error(`SGS0111: candidate "${c.id}" asks for a copy, but the picker has no store`);
  const made = c.adopt ? await c.adopt() : c.url ? await adoptImage(c.url, c.copy ? { store: o.store!, ...(o.maxBytes ? { maxBytes: o.maxBytes } : {}) } : {}) : null;
  return made ? { ...made, from: c.id } : null;
}

export function useSigilPicker(_item: Item, o: UseSigilPickerOptions): SigilPickerState {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const { record, candidates, generatedLabel, onChange, store, maxBytes, maxSide = 512 } = o;
  const choices = useMemo(() => pickerChoices(record, candidates, generatedLabel ? { generatedLabel } : {}), [record, candidates, generatedLabel]);
  const current = useMemo(() => currentChoiceId(choices, record), [choices, record]);
  const run = useCallback(
    async (id: string, make: () => Promise<SigilRecord | null>) => {
      if (busy.current) return;
      busy.current = true;
      setPending(id);
      setError(null);
      try {
        await onChange(await make());
      } catch (e) {
        setError(String((e as Error)?.message ?? e).replace(/^SGS\d{4}:\s*/, ''));
      } finally {
        busy.current = false;
        setPending(null);
      }
    },
    [onChange],
  );
  const opts = useMemo(() => ({ ...(store ? { store } : {}), ...(maxBytes ? { maxBytes } : {}) }), [store, maxBytes]);
  const pick = useCallback((choice: SigilChoice) => run(choice.id, () => resolveChoice(choice, opts)), [run, opts]);
  const upload = useCallback((file: Blob) => run('upload', () => customFromFile(file, { ...opts, ...(maxSide ? { maxSide } : {}) })), [run, opts, maxSide]);
  return { choices, current, pending, error, pick, upload };
}

export interface SigilPickerProps extends UseSigilPickerOptions {
  item: Item;
  /** Size of each choice's preview (px). */
  size?: number;
  className?: string;
  style?: CSSProperties;
  uploadLabel?: string;
  /** The wiring module's sigil, when not provided by `<SigilProvider>`. */
  sigil?: SigilApi;
}

/** A plain rendering of `useSigilPicker`: one button per choice, then an upload button. */
export function SigilPicker({ item, size = 64, className, style, uploadLabel = 'Upload image', sigil, ...o }: SigilPickerProps) {
  const p = useSigilPicker(item, o);
  const file = useRef<HTMLInputElement>(null);
  const cell: CSSProperties = { display: 'grid', justifyItems: 'center', gap: 4, padding: 6, border: '2px solid transparent', borderRadius: 12, background: 'none', color: 'inherit', font: 'inherit', fontSize: 12, cursor: 'pointer' };
  return (
    <div className={className} style={{ display: 'grid', gap: 8, ...style }} data-sigil-picker="">
      <div role="radiogroup" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {p.choices.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={p.current === c.id}
            aria-busy={p.pending === c.id || undefined}
            aria-disabled={p.pending !== null || undefined}
            onClick={() => p.pick(c)}
            style={{ ...cell, borderColor: p.current === c.id ? 'currentColor' : 'transparent', opacity: p.pending && p.pending !== c.id ? 0.5 : 1 }}
          >
            <Sigil item={item} size={size} record={c.record} retry={false} {...(sigil ? { sigil } : {})} />
            <span>{p.pending === c.id ? '…' : c.label}</span>
          </button>
        ))}
        <button type="button" aria-disabled={p.pending !== null || undefined} aria-busy={p.pending === 'upload' || undefined} onClick={() => p.pending === null && file.current?.click()} style={{ ...cell, minWidth: size + 16 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: size, height: size, border: '1px dashed currentColor', borderRadius: '20%', fontSize: size / 3 }}>{p.pending === 'upload' ? '…' : '+'}</span>
          <span>{uploadLabel}</span>
        </button>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void p.upload(f);
          }}
        />
      </div>
      {p.error && <div role="alert" style={{ fontSize: 12, color: '#d33' }}>{p.error}</div>}
    </div>
  );
}
