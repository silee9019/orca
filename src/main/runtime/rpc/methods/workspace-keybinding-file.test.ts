import '../unused-default-rpc-methods.test-fixture'
import { OrcaRuntimeService } from '../../orca-runtime'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { KeybindingService } from '../../../keybindings/keybinding-service'
import { createKeybindingFileOperations } from '../../../keybindings/keybinding-file-operations'
import {
  setKeybindingFileOperationsForRpc,
  WORKSPACE_KEYBINDING_FILE_METHODS
} from './workspace-keybinding-file'

const context = { runtime: new OrcaRuntimeService() }
let home: string
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'orca-keybinding-cli-'))
})
afterEach(async () => {
  setKeybindingFileOperationsForRpc(null)
  await rm(home, { recursive: true, force: true })
})

it('creates the host file through the existing service and reports its refreshed snapshot', async () => {
  const service = new KeybindingService({ homePath: home, platform: 'linux' })
  const onChanged = vi.fn()
  const operations = createKeybindingFileOperations(service, { onChanged })
  setKeybindingFileOperationsForRpc(operations)
  const result = await WORKSPACE_KEYBINDING_FILE_METHODS[0].handler(undefined, context)
  expect(result.path).toBe(join(home, '.orca', 'keybindings.json'))
  expect(result.exists).toBe(true)
  expect(JSON.parse(await readFile(result.path, 'utf8'))).toMatchObject({ version: 1 })
  expect(service.getSnapshot()).toBe(result)
  expect(onChanged).toHaveBeenCalledExactlyOnceWith(result)
})

it('opens and reveals only the service path and propagates an OS rejection', async () => {
  const service = new KeybindingService({ homePath: home })
  const openPath = vi.fn().mockResolvedValue('')
  const showItemInFolder = vi.fn()
  setKeybindingFileOperationsForRpc(
    createKeybindingFileOperations(service, { openPath, showItemInFolder })
  )
  const opened = await WORKSPACE_KEYBINDING_FILE_METHODS[1].handler(undefined, context)
  expect(openPath).toHaveBeenCalledExactlyOnceWith(service.getPath())
  const revealed = await WORKSPACE_KEYBINDING_FILE_METHODS[2].handler(undefined, context)
  expect(showItemInFolder).toHaveBeenCalledExactlyOnceWith(service.getPath())
  expect(opened.path).toBe(revealed.path)
  openPath.mockResolvedValue('fixture OS denied opening')
  await expect(WORKSPACE_KEYBINDING_FILE_METHODS[1].handler(undefined, context)).rejects.toThrow(
    'denied'
  )
})

it('refuses desktop actions on a headless host before creating a file', async () => {
  const service = new KeybindingService({ homePath: home })
  setKeybindingFileOperationsForRpc(createKeybindingFileOperations(service))
  for (const method of WORKSPACE_KEYBINDING_FILE_METHODS.slice(1)) {
    await expect(method.handler(undefined, context)).rejects.toThrow('desktop')
  }
  await expect(readFile(service.getPath())).rejects.toMatchObject({ code: 'ENOENT' })
})

it('fails explicitly when the host service is unavailable', async () => {
  setKeybindingFileOperationsForRpc(null)
  for (const method of WORKSPACE_KEYBINDING_FILE_METHODS) {
    await expect(method.handler(undefined, context)).rejects.toThrow('not available')
  }
})
