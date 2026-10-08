import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'

vi.mock('electron', () => ({ app: { getPath: () => 'unused-fixture' } }))
import { CrashReportStore } from '../../src/main/crash-reporting/crash-report-store'
import { WORKSPACE_CRASH_REPORT_HANDLERS } from '../../src/cli/handlers/workspace-crash-reports'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import {
  setCrashReportStoreForRpc,
  WORKSPACE_CRASH_REPORT_METHODS
} from '../../src/main/runtime/rpc/methods/workspace-crash-reports'
import {
  inFlightSubmissions,
  submittedReportIds
} from '../../src/main/ipc/crash-reporting-sendable-reports'

let dir: string
let store: CrashReportStore
let ctx: HandlerContext

async function record(reason = 'fixture-crash') {
  return store.record({
    source: 'child',
    processType: 'GPU',
    reason,
    exitCode: 1,
    appVersion: 'fixture',
    platform: 'darwin',
    osRelease: 'fixture',
    arch: 'arm64',
    electronVersion: 'fixture',
    chromeVersion: 'fixture',
    details: { message: 'diagnostic-canary' }
  })
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'orca-crash-cli-'))
  store = new CrashReportStore(join(dir, 'crash-reports.json'))
  setCrashReportStoreForRpc(store)
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: WORKSPACE_CRASH_REPORT_METHODS
  })
  const client = new RuntimeClient('fixture-unused')
  vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new RuntimeClientError(response.error.code, response.error.message)
    }
    return response
  })
  ctx = { client, cwd: dir, json: true, flags: new Map() }
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(async () => {
  setCrashReportStoreForRpc(null)
  inFlightSubmissions.clear()
  submittedReportIds.clear()
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})

it('exports the selected host report to a new private file without diagnostic stdout or host changes', async () => {
  const report = await record()
  const before = await readFile(join(dir, 'crash-reports.json'))
  ctx.flags.set('output-file', 'export.json')
  await WORKSPACE_CRASH_REPORT_HANDLERS['crash-report latest-pending'](ctx)
  expect(JSON.parse(await readFile(join(dir, 'export.json'), 'utf8'))).toEqual(report)
  if (process.platform !== 'win32') {
    expect((await stat(join(dir, 'export.json'))).mode & 0o777).toBe(0o600)
  }
  expect(await readFile(join(dir, 'crash-reports.json'))).toEqual(before)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('diagnostic-canary')
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).toContain(report.id)
})

it('preserves the sendable versus pending policy and submitted suppression', async () => {
  const report = await record()
  await store.dismiss(report.id)
  ctx.flags.set('output-file', 'pending.json')
  await WORKSPACE_CRASH_REPORT_HANDLERS['crash-report latest-pending'](ctx)
  expect(JSON.parse(await readFile(join(dir, 'pending.json'), 'utf8'))).toBeNull()
  ctx.flags.set('output-file', 'latest.json')
  await WORKSPACE_CRASH_REPORT_HANDLERS['crash-report latest'](ctx)
  expect(JSON.parse(await readFile(join(dir, 'latest.json'), 'utf8'))).toMatchObject({
    id: report.id,
    status: 'dismissed'
  })
  submittedReportIds.add(report.id)
  ctx.flags.set('output-file', 'sent.json')
  await WORKSPACE_CRASH_REPORT_HANDLERS['crash-report latest'](ctx)
  expect(JSON.parse(await readFile(join(dir, 'sent.json'), 'utf8'))).toBeNull()
})

it('requires exact confirmation before RPC and persists dismissal of related crash siblings', async () => {
  const unrelated = await record('different-crash')
  const sibling = await record()
  const report = await record()
  await writeFile(join(dir, 'input.json'), JSON.stringify({ reportId: report.id }))
  ctx.flags.set('params-file', 'input.json')
  ctx.flags.set('confirm', 'wrong')
  await expect(WORKSPACE_CRASH_REPORT_HANDLERS['crash-report dismiss'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(ctx.client.call).not.toHaveBeenCalled()
  ctx.flags.set('confirm', report.id)
  await WORKSPACE_CRASH_REPORT_HANDLERS['crash-report dismiss'](ctx)
  expect(await store.getById(report.id)).toMatchObject({ status: 'dismissed' })
  expect(await store.getById(sibling.id)).toMatchObject({ status: 'dismissed' })
  expect(await store.getById(unrelated.id)).toMatchObject({ status: 'pending' })
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('diagnostic-canary')
})

it('preserves in-flight and submitted protection without claiming dismissal', async () => {
  const report = await record()
  await writeFile(join(dir, 'input.json'), JSON.stringify({ reportId: report.id }))
  ctx.flags.set('params-file', 'input.json')
  ctx.flags.set('confirm', report.id)
  const before = await readFile(join(dir, 'crash-reports.json'))
  inFlightSubmissions.add(report.id)
  await expect(WORKSPACE_CRASH_REPORT_HANDLERS['crash-report dismiss'](ctx)).rejects.toMatchObject({
    code: 'operation_in_progress'
  })
  expect(console.log).not.toHaveBeenCalled()
  inFlightSubmissions.clear()
  submittedReportIds.add(report.id)
  await WORKSPACE_CRASH_REPORT_HANDLERS['crash-report dismiss'](ctx)
  expect(await readFile(join(dir, 'crash-reports.json'))).toEqual(before)
  expect(JSON.parse(vi.mocked(console.log).mock.calls[0][0])).toMatchObject({
    result: { status: 'sent', dismissed: false }
  })
})

it('rejects stdout exports and preserves an existing output file', async () => {
  ctx.flags.set('output-file', '-')
  await expect(WORKSPACE_CRASH_REPORT_HANDLERS['crash-report latest'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(ctx.client.call).not.toHaveBeenCalled()
  await record()
  await writeFile(join(dir, 'existing.json'), 'original')
  ctx.flags.set('output-file', 'existing.json')
  await expect(WORKSPACE_CRASH_REPORT_HANDLERS['crash-report latest'](ctx)).rejects.toMatchObject({
    code: 'output_write_failed'
  })
  expect(await readFile(join(dir, 'existing.json'), 'utf8')).toBe('original')
  expect(console.log).not.toHaveBeenCalled()
})

it('fails on missing host service or old peer without creating a client export', async () => {
  ctx.flags.set('output-file', 'absent.json')
  setCrashReportStoreForRpc(null)
  await expect(WORKSPACE_CRASH_REPORT_HANDLERS['crash-report latest'](ctx)).rejects.toMatchObject({
    code: 'runtime_unavailable'
  })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'old host')
  )
  await expect(WORKSPACE_CRASH_REPORT_HANDLERS['crash-report latest'](ctx)).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(ctx.client.call).toHaveBeenCalledTimes(2)
  await expect(stat(join(dir, 'absent.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(console.log).not.toHaveBeenCalled()
})

it('does not acknowledge a persistence failure or expose its original error', async () => {
  const report = await record()
  await writeFile(join(dir, 'input.json'), JSON.stringify({ reportId: report.id }))
  ctx.flags.set('params-file', 'input.json')
  ctx.flags.set('confirm', report.id)
  vi.spyOn(store, 'dismiss').mockRejectedValue(new Error('private-path-canary'))
  await expect(WORKSPACE_CRASH_REPORT_HANDLERS['crash-report dismiss'](ctx)).rejects.toMatchObject({
    code: 'runtime_error',
    message: 'Could not persist crash report dismissal.'
  })
  expect(await store.getById(report.id)).toMatchObject({ status: 'pending' })
  expect(console.log).not.toHaveBeenCalled()
})
