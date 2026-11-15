/**
 * sigilsmith: deterministic identity images for list items.
 *
 * This root export is the browser kernel (no zod, no Node APIs). Generators live in
 * `sigilsmith/generators/<id>/v<major>`, loaded lazily through the wiring module that
 * `sigilsmith build` writes from `sigilsmith.config.json`. Build-time tooling (schemas,
 * catalog, check, explain) is in `sigilsmith/node`.
 */
export { createSigil } from './sigil.js';
export { contentIdOf, inputsDigestOf, idsOf, stableStringify } from './ids.js';
export type { CreateSigilOptions, Sigil } from './sigil.js';
export { canonicalKey, keyOf, labelOf, getPath, parsePath, normalizePart, SigilKeyError } from './key.js';
export { selectInputs } from './inputs.js';
export { foldLayers, mergePatch } from './layers.js';
export { select, weightedPick, matches } from './policy.js';
export type { FeatureDim, FeatureSchema, FeatureVector, FeatureValue, Encoding, FeatureMapping, FeatureSet, EncodedFeatures, NormalizedFeature, FeaturePlan, FeaturePlanner } from './features.js';
export { cyrb128, hash32, sfc32, seededRng, sha256Hex } from './hash.js';
export { oklchToHex, paletteFromHash } from './palette.js';
export { svgToDataUrl, toDisplayUrl, toBytes } from './svg.js';
export { PRESETS } from './presets.js';
export { PKG_NAME } from './meta.js';
export type * from './types.js';
