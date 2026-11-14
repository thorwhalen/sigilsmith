/**
 * Generate the skill references that mirror code (SSOT): the diagnostic codes
 * (skills/sigilsmith/references/errors.md) and the target registry
 * (skills/sigilsmith/references/targets.md). Run after `npm run build`.
 */
import { writeFileSync } from 'node:fs';
import { CODES } from '../dist/node/index.js';
import { TARGETS, snippet } from '../dist/targets/index.js';

const out = (p, s) => writeFileSync(new URL(`../skills/sigilsmith/references/${p}`, import.meta.url), s);
out('errors.md', `# Diagnostic codes\n\nGenerated from \`src/node/diagnostics.ts\` by \`npm run docs\`. Groups: 01xx config, 02xx key, 03xx generator, 04xx budget, 05xx determinism and identity, 06xx targets, 07xx drift. Offline: \`npx sigilsmith explain-code <code>\`.\n\n| code | title | cause | fix |\n|---|---|---|---|\n${Object.entries(CODES).map(([c, d]) => `| ${c} | ${d.title} | ${d.cause.replace(/\|/g, '\\|')} | ${d.fix.replace(/\|/g, '\\|')} |`).join('\n')}\n`);
out('targets.md', `# Integration targets\n\nGenerated from \`src/targets/registry.ts\` by \`npm run docs\` (sources verified 2026-11-14; see docs/research/integration-and-delivery.md). \`npx sigilsmith targets --emit\` writes the files and prints these snippets filled in; \`check\` validates them when \`targets.html\`/\`targets.manifest\` are set.\n\nCrawler and OS targets (stored: yes) do not run your JavaScript: they need a stored file at a stable URL, PNG rather than SVG, and link previews need an absolute URL (\`targets.baseUrl\`).\n\n${TARGETS.map((t) => `## \`${t.id}\`: ${t.title} (${t.status}, ${t.scope})\n\n- Stored URL required: ${t.requiresStoredUrl ? 'yes' : 'no'}${t.absoluteUrl ? ', absolute' : ''}${t.maxBytes ? `; keep under ${t.maxBytes} bytes` : ''}\n- Files: ${t.files.length ? t.files.map((f) => `\`${f.path}\` ${f.format}${f.width ? ` ${f.width}x${f.height}` : ''}${f.purpose && f.purpose !== 'any' ? ` (${f.purpose})` : ''}`).join(', ') : 'none'}\n- ${t.notes}\n\n\`\`\`${t.registration.kind === 'manifest' ? 'json' : t.registration.kind === 'js' ? 'js' : 'html'}\n${snippet(t, { base: '/', url: 'https://example.com/og/sg_….png', alt: '', color: '#ffffff', url256: '/art/sg_…-256.png', url512: '/art/sg_…-512.png' })}\n\`\`\`\n`).join('\n')}`);
console.log('wrote errors.md, targets.md');
