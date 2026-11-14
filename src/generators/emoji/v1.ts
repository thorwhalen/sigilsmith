/**
 * `emoji@1`: an emoji on a tinted tile (illustrative × metadata), in-house.
 *
 * If a word of the label or a tag matches the keyword table, that emoji is used
 * (a song titled "Ocean Drive" gets 🌊); otherwise one is picked from a curated set by
 * a hash of the key, so the choice is stable. The background hue always comes from the
 * key. Emoji glyphs are drawn by the viewer's system font: the choice is
 * deterministic, the pixels are not.
 *
 * Frozen: this module's output for a given seed and params never changes.
 */
import { hash32 } from '../../hash.js';
import { paletteFromHash } from '../../palette.js';
import { svgDoc, svgImage, tile } from '../../svg.js';
import type { GeneratorModule } from '../../types.js';
import { meta, type EmojiParams } from './meta.js';

export type { EmojiParams };


export const KEYWORDS: Record<string, string> = {
  ocean: '🌊', sea: '🌊', wave: '🌊', beach: '🏖️', sun: '☀️', summer: '☀️', moon: '🌙', night: '🌙', star: '⭐', stars: '⭐',
  fire: '🔥', rain: '🌧️', snow: '❄️', winter: '❄️', storm: '⛈️', tree: '🌳', forest: '🌲', flower: '🌸', rose: '🌹', leaf: '🍃',
  mountain: '⛰️', city: '🏙️', road: '🛣️', drive: '🚗', car: '🚗', train: '🚆', plane: '✈️', rocket: '🚀', space: '🚀', earth: '🌍',
  love: '❤️', heart: '❤️', dance: '💃', party: '🎉', music: '🎵', song: '🎵', guitar: '🎸', piano: '🎹', drum: '🥁', mic: '🎤',
  movie: '🎬', film: '🎬', video: '📹', camera: '📷', photo: '📷', book: '📖', story: '📖', news: '📰', mail: '✉️', chat: '💬',
  code: '💻', bug: '🐛', data: '📊', chart: '📈', money: '💰', shop: '🛍️', home: '🏠', house: '🏠', game: '🎮', sport: '⚽',
  cat: '🐱', dog: '🐶', bird: '🐦', fish: '🐟', horse: '🐴', bear: '🐻', fox: '🦊', owl: '🦉', bee: '🐝', butterfly: '🦋',
  coffee: '☕', tea: '🍵', pizza: '🍕', cake: '🎂', apple: '🍎', wine: '🍷', food: '🍽️', gold: '🥇', crown: '👑', key: '🔑',
  dream: '💭', ghost: '👻', magic: '✨', light: '💡', time: '⏳', clock: '⏰', world: '🌍', blue: '🔵', red: '🔴', green: '🟢',
};

export const FALLBACK = [
  '🦊', '🐙', '🦉', '🐢', '🦋', '🐝', '🌵', '🍄', '🌻', '🍀', '🌙', '⭐', '🔥', '🌊', '❄️', '⚡',
  '🎈', '🎨', '🎲', '🧩', '🪁', '🎯', '🔮', '💎', '🧭', '⚓', '🚲', '🛸', '🏔️', '🏝️', '🌋', '🗿',
  '🍉', '🍋', '🍒', '🥝', '🍩', '🧁', '🌮', '🥨', '🦄', '🐳', '🦜', '🐞', '🦀', '🐼', '🦒', '🦔',
];

function pick(words: string[]): string | undefined {
  for (const w of words) {
    if (Object.hasOwn(KEYWORDS, w)) return KEYWORDS[w];
  }
  return undefined;
}

const emoji: GeneratorModule<EmojiParams> = {
  ...meta,
  render({ fields, seed, params }) {
    const h = hash32(fields.key ?? seed);
    const text = [fields.label, fields.title, fields.tags].filter(Boolean).join(' ').toLocaleLowerCase('en-US');
    const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const glyph = (params.keywords ? pick(words) : undefined) ?? FALLBACK[h % FALLBACK.length]!;
    const pal = paletteFromHash(h, { backgroundLightness: 0.9, chroma: 0.12 });
    const body = tile(pal.background, params.shape) + `<text x="50" y="50" dy="0.35em" text-anchor="middle" font-size="56" font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif">${glyph}</text>`;
    return svgImage(svgDoc(body));
  },
};

export default emoji;
