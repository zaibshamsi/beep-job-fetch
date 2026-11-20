/**
 * Font renderer for deck.gl's TextLayer atlas. deck.gl 9.4 measures a glyph as
 * `actualBoundingBoxRight - actualBoundingBoxLeft` and draws it at its origin, so a glyph that reaches left of its
 * origin (Host Grotesk's "j" hook) is cut off. This renderer measures the full box and draws the glyph inside it.
 * The glyph lands up to one atlas pixel to the right of its true place, under a pixel at label size.
 */
import type { TextLayerProps } from '@deck.gl/layers';

type GetRenderer = NonNullable<TextLayerProps['_getFontRenderer']>;

export const glyphRenderer: GetRenderer = ({ fontFamily, fontWeight, fontSize }) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const font = `${fontWeight} ${fontSize}px ${fontFamily}`;

  const box = (char: string) => {
    ctx.font = font;
    const m = ctx.measureText(char);
    const left = Math.max(0, Math.ceil(m.actualBoundingBoxLeft || 0));
    return {
      advance: m.width,
      left,
      width: Math.max(1, left + Math.ceil(m.actualBoundingBoxRight || m.width)),
      ascent: Math.ceil(m.actualBoundingBoxAscent || fontSize * 0.9),
      descent: Math.ceil(m.actualBoundingBoxDescent || fontSize * 0.3),
    };
  };

  return {
    measure(char?: string) {
      if (char === undefined) {
        ctx.font = font;
        const m = ctx.measureText('A');
        return {
          advance: 0,
          width: 0,
          ascent: Math.ceil(m.fontBoundingBoxAscent || fontSize * 0.9),
          descent: Math.ceil(m.fontBoundingBoxDescent || fontSize * 0.3),
        };
      }
      const b = box(char);
      return { advance: b.advance, width: b.width, ascent: b.ascent, descent: b.descent };
    },
    draw(char: string) {
      const b = box(char);
      const w = b.width;
      const h = Math.max(1, b.ascent + b.descent);
      if (canvas.width < w) canvas.width = w;
      if (canvas.height < h) canvas.height = h;
      ctx.font = font; // resizing the canvas resets the context state
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillText(char, b.left, b.ascent);
      return { data: ctx.getImageData(0, 0, w, h), left: 0, top: 0 };
    },
  };
};
