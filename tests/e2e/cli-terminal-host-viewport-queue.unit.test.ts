import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { expect, it } from 'vitest'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import type { ApplyLayoutResult, PtyLayoutTarget } from '../../src/main/runtime/orca-runtime'
import { store, syncSinglePty } from '../../src/main/runtime/orca-runtime-test-fixtures.spec'

class QueuedViewportRuntime extends OrcaRuntimeService {
  gate?: Promise<void>
  protected override async applyLayout(
    id: string,
    target: PtyLayoutTarget,
    ownerMatches?: () => boolean
  ): Promise<ApplyLayoutResult> {
    const gate = this.gate
    this.gate = undefined
    if (gate) {
      await gate
    }
    return super.applyLayout(id, target, ownerMatches)
  }
  enqueue(id: string, cols: number, ownerMatches?: () => boolean): Promise<ApplyLayoutResult> {
    return this.enqueueLayout(id, { kind: 'desktop', cols, rows: 24 }, ownerMatches)
  }
}

it('keeps a guarded queue entry separate and rejects it before physical resize', async () => {
  const runtime = new QueuedViewportRuntime(store),
    id = 'viewport-queue-fixture'
  const sizes: number[] = []
  runtime.setPtyController({
    write: () => true,
    kill: () => {},
    getForegroundProcess: async () => null,
    getSize: () => ({ cols: 80, rows: 24 }),
    resize: (_id, cols) => {
      sizes.push(cols)
      return true
    }
  })
  syncSinglePty(runtime, id)
  await runtime.updateRemoteDesktopViewer(id, 'fixture-viewer', 'fixture-client', 40, 12)
  sizes.length = 0
  let release: (() => void) | undefined,
    owner = true
  runtime.gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const first = runtime.enqueue(id, 41)
  const guarded = runtime.enqueue(id, 100, () => owner)
  const last = runtime.enqueue(id, 101)
  owner = false
  release?.()
  expect((await first).ok).toBe(true)
  expect(await guarded).toEqual({ ok: false, reason: 'owner-changed' })
  expect((await last).ok).toBe(true)
  expect(sizes).toEqual([41, 101])
  expect(runtime.getLayout(id)).toMatchObject({ cols: 101, rows: 24 })
  expect(
    Object.values(runtime.getLayout(id) ?? {}).some((value) => typeof value === 'function')
  ).toBe(false)
})

it('does not publish completion after a resize replaces the pinned owner', async () => {
  const runtime = new QueuedViewportRuntime(store),
    id = 'viewport-reentrant-fixture'
  let owner = true,
    invalidate = false
  runtime.setPtyController({
    write: () => true,
    kill: () => {},
    getForegroundProcess: async () => null,
    getSize: () => ({ cols: 80, rows: 24 }),
    resize: () => {
      if (invalidate) {
        owner = false
      }
      return true
    }
  })
  syncSinglePty(runtime, id)
  await runtime.updateRemoteDesktopViewer(id, 'fixture-viewer', 'fixture-client', 40, 12)
  invalidate = true
  expect(await runtime.enqueue(id, 100, () => owner)).toEqual({
    ok: false,
    reason: 'owner-changed'
  })
  expect(runtime.getLayout(id)).toBeNull()
})
