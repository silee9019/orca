import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { buildRegistry } from '../core'
import { desktopAppTarget } from './desktop-app-target'
import { DESKTOP_FEEDBACK_METHODS } from './desktop-feedback'

const submit = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }))
vi.mock('../../../ipc/feedback', () => ({ submitFeedback: submit }))
vi.mock('../../orca-runtime', () => ({
  OrcaRuntimeService: class {
    getRuntimeId() {
      return 'feedback-fixture'
    }
    getStatus() {
      return { desktopWindowStatus: 'available' }
    }
  }
}))
const context = { runtime: OrcaRuntimeService.prototype }
const registry = buildRegistry(DESKTOP_FEEDBACK_METHODS)
async function send(input: unknown) {
  const method = registry.get('desktopFeedback.submit')
  if (!method || 'stream' in method || !method.params) {
    throw new Error('Missing feedback method')
  }
  return method.handler(method.params.parse(input), context)
}
beforeEach(() =>
  Object.defineProperty(process.versions, 'electron', { configurable: true, value: 'fixture' })
)
afterEach(() => {
  Reflect.deleteProperty(process.versions, 'electron')
  vi.clearAllMocks()
})
it('reads an explicit host image and removes identity for anonymous feedback without echoing the report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'orca-feedback-fixture-'))
  const file = join(dir, 'fixture.png')
  try {
    const bytes = Buffer.from([137, 80, 78, 71])
    await writeFile(file, bytes)
    expect(
      await send({
        confirmTarget: desktopAppTarget(context),
        feedback: 'private canary',
        submitAnonymously: true,
        githubLogin: 'private-login',
        githubEmail: 'private-email',
        images: [{ path: file, contentType: 'image/png' }]
      })
    ).toEqual({ ok: true })
    expect(submit).toHaveBeenCalledWith({
      feedback: 'private canary',
      submitAnonymously: true,
      githubLogin: null,
      githubEmail: null,
      images: [{ contentType: 'image/png', data: bytes }],
      submissionType: 'feedback'
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
it('rejects an old app target before reading files or sending feedback', async () => {
  await expect(
    send({
      confirmTarget: 'stale-app',
      feedback: 'private canary',
      submitAnonymously: false,
      images: [{ path: '/does-not-exist', contentType: 'image/png' }]
    })
  ).rejects.toMatchObject({ code: 'target_mismatch' })
  expect(submit).not.toHaveBeenCalled()
})
it('does not admit a crash attachment or a relative image path', async () => {
  await expect(
    send({
      confirmTarget: desktopAppTarget(context),
      feedback: 'body',
      submitAnonymously: true,
      diagnosticBundle: { content: 'secret' }
    })
  ).rejects.toThrow()
  await expect(
    send({
      confirmTarget: desktopAppTarget(context),
      feedback: 'body',
      submitAnonymously: true,
      images: [{ path: 'relative.png', contentType: 'image/png' }]
    })
  ).rejects.toThrow(/absolute/)
  expect(submit).not.toHaveBeenCalled()
})
