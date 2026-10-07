import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { decodePng } from './trim-windows-icon-source.mjs'

const root = new URL('../../', import.meta.url)
const source = readFileSync(new URL('resources/build/icon.png', root))

test('committed Dev icons deterministically retain the source and include all ICNS sizes', async () => {
  const committedIcns = readFileSync(new URL('config/dev-app-icon.icns', root))
  const { buildDevAppIcons } = await import('./generate-dev-app-icon.mjs')
  const first = buildDevAppIcons(source)
  const second = buildDevAppIcons(source)
  assert.deepEqual(first, second)
  assert.deepEqual(first.png, readFileSync(new URL('resources/icon-dev.png', root)))
  assert.deepEqual(first.icns, committedIcns)
  const original = decodePng(source)
  const dev = decodePng(first.png)
  assert.equal(dev.width, 1024)
  assert.equal(dev.height, 1024)
  assert.deepEqual(dev.data.subarray(0, 1024 * 640 * 4), original.data.subarray(0, 1024 * 640 * 4))
  for (let i = 3; i < dev.data.length; i += 4) {
    assert.equal(dev.data[i], original.data[i])
  }
  assert.equal(first.icns.toString('ascii', 0, 4), 'icns')
  assert.equal(first.icns.readUInt32BE(4), first.icns.length)
  const sizes = []
  for (let offset = 8; offset < first.icns.length;) {
    const length = first.icns.readUInt32BE(offset + 4)
    assert.ok(length > 8)
    const payload = first.icns.subarray(offset + 8, offset + length)
    let frame
    if (payload.toString('ascii', 0, 4) === 'ARGB') {
      const size = first.icns.toString('ascii', offset, offset + 4) === 'ic04' ? 16 : 32
      const values = []
      for (let i = 4; i < payload.length;) {
        const count = payload[i++] + 1
        assert.ok(count <= 128)
        values.push(...payload.subarray(i, i + count))
        i += count
      }
      assert.equal(values.length, size * size * 4)
      const data = Buffer.alloc(values.length)
      for (const [plane, channel] of [3, 0, 1, 2].entries()) {
        for (let i = 0; i < size * size; i++) {
          data[i * 4 + channel] = values[plane * size * size + i]
        }
      }
      frame = { width: size, height: size, data }
    } else {
      frame = decodePng(payload)
    }
    assert.equal(frame.width, frame.height)
    sizes.push(frame.width)
    let warningPixels = 0
    let textPixels = 0
    for (let y = Math.floor(frame.height * 0.5); y < Math.floor(frame.height * 0.9); y++) {
      for (let x = Math.floor(frame.width * 0.2); x < Math.floor(frame.width * 0.8); x++) {
        const i = (y * frame.width + x) * 4
        if (frame.data[i] === 202 && frame.data[i + 1] === 138 && frame.data[i + 2] === 4) {
          warningPixels++
        }
        if (
          frame.data[i] === 0 &&
          frame.data[i + 1] === 0 &&
          frame.data[i + 2] === 0 &&
          frame.data[i + 3] === 255
        ) {
          textPixels++
        }
      }
    }
    assert.ok(warningPixels > 0, 'warning band must survive each size')
    assert.ok(textPixels > 0, 'label ink must survive each size')
    offset += length
  }
  assert.deepEqual(sizes, [16, 32, 64, 128, 256, 512, 1024])
})

test(
  'macOS decodes the 16px ICNS slot into the complete DEV glyphs',
  { skip: process.platform !== 'darwin' },
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'orca-dev-icon-'))
    try {
      const input = join(dir, 'dev.icns')
      const output = join(dir, 'dev.iconset')
      writeFileSync(input, readFileSync(new URL('config/dev-app-icon.icns', root)))
      execFileSync('/usr/bin/iconutil', ['-c', 'iconset', input, '-o', output])
      const frame = decodePng(readFileSync(join(output, 'icon_16x16.png')))
      const rows = []
      for (let y = 8; y < 13; y++) {
        let row = ''
        for (let x = 2; x < 13; x++) {
          const i = (y * 16 + x) * 4
          const pixel = Array.from(frame.data.subarray(i, i + 4))
          assert.ok(pixel[3] >= 240)
          if (pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0) {
            row += '#'
          } else {
            assert.deepEqual(pixel.slice(0, 3), [202, 138, 4])
            row += '.'
          }
        }
        rows.push(row)
      }
      assert.deepEqual(rows, [
        '##..###.#.#',
        '#.#.#...#.#',
        '#.#.##..#.#',
        '#.#.#...#.#',
        '##..###..#.'
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
)
