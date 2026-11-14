/**
 * Built-in presets by item type (B4.3, layer 2).
 *
 * A preset says, per item type, which fields semantic generators read, which
 * generator to suggest when no project rule matches, and default params. Hash
 * generators keep reading the key unless a preset says otherwise, so enabling a
 * preset never changes an identicon. Presets are plain data: `sigilsmith build`
 * copies the selected ones into the resolved config.
 */
import type { Preset } from './types.js';

export const PRESETS: Record<string, Preset> = {
  media: {
    name: 'media',
    description: 'Songs, albums, videos, podcasts. Semantic generators read title and artist, and lyrics when present (truncated).',
    byType: {
      song: { semanticInputs: ['title', 'artist', { field: 'lyrics', maxChars: 2000 }] },
      track: { semanticInputs: ['title', 'artist', { field: 'lyrics', maxChars: 2000 }] },
      audio: { semanticInputs: ['title', 'artist', { field: 'lyrics', maxChars: 2000 }] },
      album: { semanticInputs: ['title', 'artist'] },
      video: { semanticInputs: ['title', { field: 'description', maxChars: 1000 }] },
      podcast: { semanticInputs: ['title', { field: 'description', maxChars: 1000 }] },
    },
  },
  people: {
    name: 'people',
    description: 'Users, contacts, authors. Suggests initials avatars, which read the display name and take colour from the key.',
    byType: {
      user: { use: 'initials@1', semanticInputs: ['$label', '$key'] },
      person: { use: 'initials@1', semanticInputs: ['$label', '$key'] },
      contact: { use: 'initials@1', semanticInputs: ['$label', '$key'] },
      author: { use: 'initials@1', semanticInputs: ['$label', '$key'] },
    },
  },
  documents: {
    name: 'documents',
    description: 'Documents, notes, projects. Semantic generators read title, tags and a short description.',
    byType: {
      '*': { semanticInputs: ['title', 'tags', { field: 'description', maxChars: 500 }] },
    },
  },
};
