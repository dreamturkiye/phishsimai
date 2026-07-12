declare module 'opentype.js' {
  export class Path {
    extend(path: Path): void
    toPathData(decimalPlaces?: number): string
    getBoundingBox(): { x1: number; y1: number; x2: number; y2: number }
  }

  export interface Glyph {
    advanceWidth: number
    getPath(x: number, y: number, fontSize: number): Path
  }

  export interface Font {
    unitsPerEm: number
    charToGlyph(character: string): Glyph
  }

  export function parse(buffer: Buffer | ArrayBuffer | Uint8Array): Font

  const opentype: {
    Path: typeof Path
    parse: typeof parse
  }

  export default opentype
}
