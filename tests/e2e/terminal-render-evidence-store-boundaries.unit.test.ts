import { mkdtemp, mkdir, readdir, rm, open, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { queueTerminalRenderDesyncEvidence } from '../../src/main/terminal-render-desync-evidence-store'
const args = {
  captureId: 'cli-fixture',
  phase: 'corrupt' as const,
  pngDataUrl: 'data:image/png;base64,eA=='
}
it('shares the canonical queue, keeps failed writes from poisoning it, and prunes aggregate bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-render-store-'))
  try {
    await expect(
      queueTerminalRenderDesyncEvidence(
        root,
        { ...args, captureId: '../outside' },
        { exclusive: true }
      )
    ).rejects.toThrow()
    const evidence = join(root, 'terminal-render-desync-evidence'),
      large = join(evidence, 'old-large')
    await mkdir(large, { recursive: true })
    const file = await open(join(large, 'corrupt.png'), 'w')
    try {
      await file.truncate(97 * 1024 * 1024)
    } finally {
      await file.close()
    }
    await Promise.all([
      queueTerminalRenderDesyncEvidence(root, args, { exclusive: true }),
      queueTerminalRenderDesyncEvidence(root, { ...args, phase: 'healed' }, { exclusive: true })
    ])
    expect(await readdir(evidence)).toEqual(['cli-fixture'])
    expect((await readdir(join(evidence, 'cli-fixture'))).sort()).toEqual([
      'corrupt.png',
      'healed.png'
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
it.skipIf(process.platform === 'win32')(
  'refuses a symbolic-link evidence root before writing through it',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-render-store-link-'))
    try {
      const outside = join(root, 'outside')
      await mkdir(outside)
      await symlink(outside, join(root, 'terminal-render-desync-evidence'), 'dir')
      await expect(
        queueTerminalRenderDesyncEvidence(root, args, { exclusive: true })
      ).rejects.toThrow('Invalid evidence root')
      expect(await readdir(outside)).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
)
