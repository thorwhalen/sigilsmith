/**
 * `sigilsmith/node`: build-time tooling. Schemas, config loading, the catalog, and
 * every agent primitive as a plain function returning a JSON envelope (catalog,
 * preview, detect-key, explain, build, targets, check, explain-code, init).
 *
 * The CLI is a thin layer over these functions, and an MCP or HTTP surface would be
 * too: one list of operations, several surfaces.
 */
export { ConfigSchema, ManifestSchema, TargetSpecSchema, RefSchema, type Config, type ConfigInput, type Manifest } from './schema.js';
export { loadConfig, resolveConfig, loadSamples, referencedRefs, type LoadedConfig } from './config.js';
export { catalog, loadCatalog, readSizes, type CatalogQuery } from './catalog.js';
export { detectKey, KEY_PRIORITY, type KeyReport } from './detect.js';
export { explainItems } from './explain.js';
export { build, computeLock, fingerprint, renderWiringModule, GOLDEN_SEEDS, type Lock } from './build.js';
export { check, SECTIONS, type Section } from './check.js';
export { preview, DEFAULT_SAMPLE_ITEMS } from './preview.js';
export { emitTargets, listTargetsCmd, checkTargets } from './targets.js';
export { init, detectKeyCmd, agentsBlock } from './commands.js';
export { CODES, diag, envelope, explainCode, formatDiagnostic, type Diagnostic, type Envelope } from './diagnostics.js';
export { BUILTINS, BUILTIN_BY_REF } from './builtins.js';
export { nodeSigil } from './runtime.js';
export { svgToPng, packIco, pngSize } from './raster.js';
export { OPERATIONS, getOperation, runOperation, type Operation, type OperationContext } from './operations.js';
