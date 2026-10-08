import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { KeybindingService } from '../../src/main/keybindings/keybinding-service'
import { createKeybindingFileOperations } from '../../src/main/keybindings/keybinding-file-operations'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import {
  setKeybindingFileOperationsForRpc,
  WORKSPACE_KEYBINDING_FILE_METHODS
} from '../../src/main/runtime/rpc/methods/workspace-keybinding-file'
import { WORKSPACE_KEYBINDING_FILE_HANDLERS } from '../../src/cli/handlers/workspace-keybinding-file'

let directory: string
let ctx: HandlerContext
let service: KeybindingService
const openPath = vi.fn().mockResolvedValue('')
const showItemInFolder = vi.fn()
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-keybinding-'))
  service = new KeybindingService({ homePath: join(directory, 'runtime-home') })
  setKeybindingFileOperationsForRpc(
    createKeybindingFileOperations(service, { openPath, showItemInFolder })
  )
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: WORKSPACE_KEYBINDING_FILE_METHODS
  })
  const client = new RuntimeClient(join(directory, 'cli-home'))
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
  ctx = { client, cwd: directory, json: true, flags: new Map() }
  vi.spyOn(console, 'log').mockImplementation(() => {})
  openPath.mockClear()
  showItemInFolder.mockClear()
})
afterEach(async () => {
  setKeybindingFileOperationsForRpc(null)
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('creates the runtime host file through the actual CLI handler and RPC dispatcher', async () => {
  await WORKSPACE_KEYBINDING_FILE_HANDLERS['keybindings ensure-file'](ctx)
  expect(JSON.parse(await readFile(service.getPath(), 'utf8'))).toMatchObject({ version: 1 })
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining(service.getPath()))
  await expect(
    readFile(join(directory, 'cli-home', '.orca', 'keybindings.json'))
  ).rejects.toMatchObject({
    code: 'ENOENT'
  })
})

it('requires exact desktop confirmation and dispatches only the host service path', async () => {
  for (const action of ['open-file', 'reveal-file']) {
    await expect(
      WORKSPACE_KEYBINDING_FILE_HANDLERS[`keybindings ${action}`](ctx)
    ).rejects.toMatchObject({
      code: 'invalid_argument'
    })
  }
  expect(ctx.client.call).not.toHaveBeenCalled()
  ctx.flags.set('confirm', 'keybindings')
  await WORKSPACE_KEYBINDING_FILE_HANDLERS['keybindings open-file'](ctx)
  await WORKSPACE_KEYBINDING_FILE_HANDLERS['keybindings reveal-file'](ctx)
  expect(openPath).toHaveBeenCalledExactlyOnceWith(service.getPath())
  expect(showItemInFolder).toHaveBeenCalledExactlyOnceWith(service.getPath())
})

it('fails on an old peer without retrying or creating a client file', async () => {
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'old peer')
  )
  await expect(
    WORKSPACE_KEYBINDING_FILE_HANDLERS['keybindings ensure-file'](ctx)
  ).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(ctx.client.call).toHaveBeenCalledTimes(1)
  await expect(readFile(service.getPath())).rejects.toMatchObject({ code: 'ENOENT' })
})
