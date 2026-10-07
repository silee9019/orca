// Regenerate after resources/icon-source/generate.sh: node config/scripts/generate-dev-app-icon.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { decodePng, encodePng, resizeImage } from './trim-windows-icon-source.mjs'

const ICNS_SLOTS = [
  ['ic04', 16],
  ['ic05', 32],
  ['ic12', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024]
]
// Fixed glyphs avoid platform font substitution and keep DEV legible at 16px.
const DEV_GLYPHS = ['110101101101110', '111100110100111', '101101101101010']

function addDevBadge(image) {
  const { width: size, data } = image
  const unit = Math.max(1, Math.floor((size * 0.5) / 11))
  const padding = Math.max(1, Math.round(size * 0.015))
  const bottom = Math.round(size * 0.9)
  const top = Math.min(Math.round(size * 0.64), bottom - 5 * unit - 2 * padding)
  const left = Math.floor((size - 11 * unit) / 2)
  const textTop = Math.floor((top + bottom - 5 * unit) / 2)
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4
      if (data[offset + 3] < 240) {
        continue
      }
      const column = Math.floor((x - left) / unit)
      const row = Math.floor((y - textTop) / unit)
      const glyph = DEV_GLYPHS[Math.floor(column / 4)]
      const ink =
        row >= 0 &&
        row < 5 &&
        column >= 0 &&
        column % 4 < 3 &&
        glyph?.[row * 3 + (column % 4)] === '1'
      // STYLEGUIDE main.css :root --status-warning; black keeps the label readable.
      data.set(ink ? [0, 0, 0] : [202, 138, 4], offset)
    }
  }
  return image
}

function encodeSmallIcnsArgb({ data }) {
  const packets = [Buffer.from('ARGB')]
  for (const channel of [3, 0, 1, 2]) {
    const values = Buffer.alloc(data.length / 4)
    for (let i = 0; i < values.length; i++) {
      values[i] = data[i * 4 + channel]
    }
    for (let i = 0; i < values.length; i += 128) {
      const literal = values.subarray(i, i + 128)
      packets.push(Buffer.from([literal.length - 1]), literal)
    }
  }
  return Buffer.concat(packets)
}

export function buildDevAppIcons(sourcePng) {
  const source = decodePng(sourcePng)
  if (source.width !== 1024 || source.height !== 1024) {
    throw new Error('Expected the official 1024x1024 icon render.')
  }
  const frames = ICNS_SLOTS.map(([type, size]) => {
    const image = addDevBadge(resizeImage(source, size, size))
    const png = encodePng(image)
    // macOS requires ARGB channel packets for the non-Retina 16/32px slots.
    const payload = size <= 32 ? encodeSmallIcnsArgb(image) : png
    const header = Buffer.alloc(8)
    header.write(type)
    header.writeUInt32BE(payload.length + 8, 4)
    return { png, chunk: Buffer.concat([header, payload]) }
  })
  const chunks = Buffer.concat(frames.map((frame) => frame.chunk))
  const header = Buffer.alloc(8)
  header.write('icns')
  header.writeUInt32BE(chunks.length + 8, 4)
  return { png: frames.at(-1).png, icns: Buffer.concat([header, chunks]) }
}

if (process.argv[1] === import.meta.filename) {
  const root = new URL('../../resources/', import.meta.url)
  const icons = buildDevAppIcons(readFileSync(new URL('build/icon.png', root)))
  writeFileSync(new URL('icon-dev.png', root), icons.png)
  writeFileSync(new URL('../dev-app-icon.icns', import.meta.url), icons.icns)
}
