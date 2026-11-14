/**
 * Package identity, in one place.
 *
 * The package name appears here and in `package.json` only. Codegen, CLI help, the
 * AGENTS.md block and diagnostics read it from here, so renaming the package is a
 * two-line change (B16).
 */
export const PKG_NAME = 'sigilsmith';
export const CONFIG_FILE = `${PKG_NAME}.config.json`;
export const LOCK_FILE = `${PKG_NAME}.lock.json`;
export const GEN_FILE = `${PKG_NAME}.gen.ts`;
export const SAMPLES_FILE = `${PKG_NAME}.samples.json`;
export const DIAGNOSTIC_PREFIX = 'SGS';
