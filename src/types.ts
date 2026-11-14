/**
 * Core types shared by the kernel, generators, delivery and the Node tooling.
 *
 * These are plain TypeScript types: the runtime never imports zod. The zod schemas
 * that validate the same shapes live in `src/node/schema.ts` and are used at build
 * time (CLI, `check`, `build`).
 */

/** Anything the app wants an identity image for: a song, a user, a project. */
export type Item = Record<string, unknown>;

/** A field path (`title`, `meta.uuid`), `$key` (the resolved item key) or `$label`. */
export type InputSpec = string | { field: string; maxChars?: number };

/** What a generator returns. SVG is the canonical, byte-stable form. */
export type SigilImage =
  | { type: 'svg'; svg: string }
  | { type: 'blob'; blob: Blob; mime: string }
  | { type: 'url'; url: string; mime?: string };

export interface Palette {
  /** Opaque tile background, light tint of the main hue. */
  background: string;
  /** Main foreground colour, mid lightness so it reads on light and dark pages. */
  primary: string;
  /** Two more colours at rotated hues, for multi-colour generators. */
  secondary: string;
  accent: string;
  /** Dark text colour that contrasts with `background`. */
  ink: string;
  /** Main hue in degrees (integer), for generators that derive their own colours. */
  hue: number;
}

export interface RenderContext<P = Record<string, unknown>> {
  /** Canonical serialization of the input values: the identity being drawn. */
  seed: string;
  /** 32-bit hash of `seed` (decorrelated per generator ref). */
  hash: number;
  /** Seeded PRNG in [0, 1). Never use Math.random in a generator. */
  rng: () => number;
  /** Hash-derived palette (OKLCH space, emitted as sRGB hex). */
  palette: Palette;
  /** Named input values, e.g. `{ key: 'a1', label: 'Blue Monday', lyrics: '...' }`. */
  fields: Record<string, string>;
  /** Effective params after the five layers. */
  params: P;
  /** Requested pixel size; SVG generators may ignore it. */
  size: number;
}

/** The contract every generator module implements (one module per output major). */
export interface GeneratorModule<P extends object = Record<string, unknown>> {
  id: string;
  /** Output contract version. A released major never changes its output. */
  major: number;
  /** `hash` generators read the key by default; `semantic` ones read meaningful fields. */
  kind: 'hash' | 'semantic';
  defaults: P;
  defaultInputs: InputSpec[];
  /** Determinism class; `derived` delivery requires `pure`. */
  determinism: 'pure' | 'seeded' | 'cached-nondeterministic';
  render(ctx: RenderContext<P>): SigilImage | Promise<SigilImage>;
}

export type GeneratorLoader = () => Promise<GeneratorModule<any> | { default: GeneratorModule<any> }>;

/** Matcher for a rule's `when`: equality, any-of, or `includes` on array fields. */
export type Matcher = string | number | boolean | Array<string | number> | { includes: string } | { exists: boolean };

export interface PolicyRule {
  when: Record<string, Matcher>;
  use: string | Record<string, number>;
  inputs?: InputSpec[];
  params?: Record<string, Record<string, unknown>>;
}

export interface PresetEntry {
  use?: string;
  hashInputs?: InputSpec[];
  semanticInputs?: InputSpec[];
  params?: Record<string, Record<string, unknown>>;
}

export interface Preset {
  name: string;
  description: string;
  byType: Record<string, PresetEntry>;
}

export type KeySpec =
  | { kind: 'field'; field: string }
  | { kind: 'fields'; fields: string[] }
  | { kind: 'custom'; ref: string };

/**
 * The config after `sigilsmith build`: validated, presets expanded, plain JSON.
 * This is what the runtime receives; it is never re-validated in the browser.
 */
export interface ResolvedConfig {
  version: 1;
  itemTypeField: string | null;
  key: { spec: KeySpec; fallback: string[]; onMissing: 'fallback' | 'throw' };
  label: { fields: string[] };
  presets: Preset[];
  generators: Record<string, { inputs?: InputSpec[]; params?: Record<string, unknown> }>;
  policy: { default: string; salt: string; rules: PolicyRule[]; placeholder: string };
  delivery: { strategy: 'materialized' | 'derived' | 'hybrid'; format: 'svg' | 'png' };
  regeneration: { policy: 'ask' | 'always' | 'never' };
  userSettings: { choices: string[]; perType: boolean; params: Record<string, string[]> };
}

/** Layer 5: what an end user chose, within `userSettings`. */
export interface UserLayer {
  enabled?: boolean;
  /** Generator ref per item type; `*` applies to every type. */
  style?: Record<string, string>;
  params?: Record<string, Record<string, unknown>>;
}

export type LayerName = 'generator' | `preset:${string}` | 'project' | `rule:${number}` | 'user';

export interface LeafProvenance {
  path: string;
  value: unknown;
  layer: LayerName;
  shadowed: Array<{ layer: LayerName; value: unknown }>;
}

export interface SelectionTrace {
  ref: string;
  via: 'custom' | 'user' | `rule:${number}` | `preset:${string}` | 'default';
  weights?: Record<string, number>;
  bucket?: number;
}

/** Everything `explain` needs for one item, computed without rendering. */
export interface Plan {
  key: string;
  keyVia: 'key' | 'fallback';
  keyMissing: string[];
  itemType: string | null;
  selection: SelectionTrace;
  inputs: InputSpec[];
  params: Record<string, unknown>;
  provenance: LeafProvenance[];
  fields: Record<string, string>;
  missingInputs: string[];
  seed: string;
}
