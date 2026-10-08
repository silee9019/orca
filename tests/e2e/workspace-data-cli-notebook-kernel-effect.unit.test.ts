import { directory, store, ctx } from './workspace-data-cli-remote-clone-fixture'
import { mkdir, writeFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type * as ProcessRunner from '../../src/shared/child-process/run-process'
import type { ChildProcess } from 'node:child_process'
vi.mock('../../resources/notebook/kernel-bridge.py?asset&asarUnpack', () => ({
  default: 'fixture-original-bridge.py'
}))
vi.mock('../../src/shared/child-process/run-process', async (importOriginal) => {
  const original = await importOriginal<typeof ProcessRunner>()
  return {
    ...original,
    spawnProcess: (spec: Parameters<typeof original.spawnProcess>[0]) => {
      expect(spec.program).toBe(process.execPath)
      expect(spec.args).toHaveLength(1)
      expect(spec.cwd).toBe(join(directory, 'document'))
      const child = original.spawnProcess({ ...spec, args: [bridgePath] })
      children.push(child)
      return child
    }
  }
})
import { registerNotebookHandlers } from '../../src/main/ipc/notebook'
import { WORKSPACE_NOTEBOOK_KERNEL_HANDLERS } from '../../src/cli/handlers/workspace-notebook-kernel'
import {
  WORKSPACE_NOTEBOOK_KERNEL_METHODS,
  setDesktopNotebookKernelForRpc
} from '../../src/main/runtime/rpc/methods/workspace-notebook-kernel'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
const children: ChildProcess[] = []
let bridgePath: string
let filePath: string
const bridgeSource = `
const readline = require('node:readline');let held=false;let count=0;
const send = x => process.stdout.write(JSON.stringify(x)+'\\n');
send({type:'ready'});
readline.createInterface({input:process.stdin}).on('line', line => {
  const command=JSON.parse(line);
  if(command.op==='execute'){
    count++;
    if(command.code==='hold'){held=true;return;}
    if(command.code==='damage'){process.stdout.write('x'.repeat(1024*1024+1));return;}
    send({type:'execute_result',content:{data:{'text/plain':'42'},execution_count:count}});
    send({type:'done',status:'ok',execution_count:count});
  } else if(command.op==='interrupt'&&held){held=false;send({type:'error',content:{ename:'KeyboardInterrupt'}});send({type:'done',status:'error',execution_count:count});}
});process.stdin.on('end',()=>process.exit(0));
`
async function invoke(action: string, params: object, confirmation?: string) {
  const input = join(directory, 'kernel-params.json')
  await writeFile(input, JSON.stringify({ expectedExecutionHostId: 'local', ...params }))
  ctx.flags = new Map([
    ['params-file', input],
    ['confirm', confirmation ?? `local:${filePath}:${process.execPath}`]
  ])
  await WORKSPACE_NOTEBOOK_KERNEL_HANDLERS[`notebook kernel-${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
function start() {
  return invoke('start', { expectedKernelHostId: 'local', filePath, python: process.execPath })
}
async function wait(id: string, state: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const status = await invoke('status', { requestId: id })
    if (status.state === state) {
      return status
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Notebook state did not settle')
}
beforeEach(async () => {
  await mkdir(join(directory, 'document'))
  filePath = join(directory, 'document', 'notebook.ipynb')
  bridgePath = join(directory, 'fixture-bridge.cjs')
  await writeFile(filePath, '{"cells":[]}')
  await writeFile(bridgePath, bridgeSource)
  registerNotebookHandlers(store)
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_NOTEBOOK_KERNEL_METHODS
  })
  vi.mocked(ctx.client.call).mockImplementation(async (method, params) => {
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
})
afterEach(async () => {
  setDesktopNotebookKernelForRpc(null)
  await Promise.all(
    children.splice(0).map(async (child) => {
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise<void>((resolve) => {
          child.once('close', () => resolve())
          child.kill()
        })
      }
    })
  )
})
it('uses the original bridge parser and owned private process for ready, cell frames and exit', async () => {
  const alias = join(directory, 'alias.ipynb')
  await symlink(filePath, alias)
  filePath = alias
  const request = await start()
  expect(request.state).toBe('pending')
  await wait(request.requestId, 'ready')
  await expect(start()).rejects.toThrow('desktop_notebook_kernel_busy')
  expect(
    await invoke('execute', { requestId: request.requestId, code: 'answer' }, request.requestId)
  ).toMatchObject({ accepted: true })
  let result
  await vi.waitFor(async () => {
    result = await invoke('frames', { requestId: request.requestId })
    expect(result.frames).toHaveLength(2)
  })
  expect(result).toMatchObject({
    frames: [
      { sequence: 1, frame: { type: 'execute_result', content: { data: { 'text/plain': '42' } } } },
      { sequence: 2, frame: { type: 'done', status: 'ok' } }
    ]
  })
  const page = await invoke('frames', { requestId: request.requestId, afterSequence: 1, limit: 1 })
  expect(page).toMatchObject({ nextSequence: 2, hasMore: false })
  expect((await invoke('status', { requestId: request.requestId })).executing).toBe(false)
  expect((await invoke('shutdown', { requestId: request.requestId })).state).toBe('stopping')
  expect(await wait(request.requestId, 'exited')).toMatchObject({ executionVerdict: 'exited' })
  expect(children).toHaveLength(1)
  expect(children[0].exitCode).toBe(0)
})
it('interrupts only its owned execution and keeps the slot busy until done', async () => {
  const request = await start()
  await wait(request.requestId, 'ready')
  await invoke('execute', { requestId: request.requestId, code: 'hold' }, request.requestId)
  await expect(
    invoke('execute', { requestId: request.requestId, code: 'second' }, request.requestId)
  ).rejects.toThrow()
  await invoke('interrupt', { requestId: request.requestId })
  await vi.waitFor(async () =>
    expect((await invoke('status', { requestId: request.requestId })).executing).toBe(false)
  )
  expect(await invoke('frames', { requestId: request.requestId })).toMatchObject({
    frames: [
      { frame: { type: 'error', content: { ename: 'KeyboardInterrupt' } } },
      { frame: { type: 'done', status: 'error' } }
    ]
  })
  await invoke('shutdown', { requestId: request.requestId })
  await wait(request.requestId, 'exited')
})
it('reports missing packages and damaged bounded protocol without exposing startup diagnostics', async () => {
  await writeFile(
    bridgePath,
    bridgeSource.replace("send({type:'ready'});", "send({type:'missing',externallyManaged:true});")
  )
  let request = await start()
  await wait(request.requestId, 'missing-ipykernel')
  await vi.waitFor(async () =>
    expect((await invoke('status', { requestId: request.requestId })).executionVerdict).toBe(
      'exited'
    )
  )
  await writeFile(bridgePath, bridgeSource)
  request = await start()
  await wait(request.requestId, 'ready')
  await invoke('execute', { requestId: request.requestId, code: 'damage' }, request.requestId)
  await wait(request.requestId, 'failed')
  await vi.waitFor(async () =>
    expect((await invoke('status', { requestId: request.requestId })).executionVerdict).toBe(
      'exited'
    )
  )
  expect(vi.mocked(console.error)).not.toHaveBeenCalled()
})
it('rejects caller ownership, cross-host paths, confirmation and unavailable or old services', async () => {
  for (const extra of [
    { sender: 1 },
    { expectedKernelHostId: 'ssh:foreign' },
    { filePath: '//wsl.localhost/Ubuntu/fixture.ipynb' },
    { python: 'python3' }
  ]) {
    await expect(
      invoke('start', {
        expectedKernelHostId: 'local',
        filePath,
        python: process.execPath,
        ...extra
      })
    ).rejects.toThrow()
  }
  await expect(
    invoke('start', { expectedKernelHostId: 'local', filePath, python: process.execPath }, 'wrong')
  ).rejects.toThrow()
  expect(children).toEqual([])
  const request = await start()
  await wait(request.requestId, 'ready')
  await expect(
    invoke('execute', { requestId: request.requestId, code: 'secret-input' }, 'wrong')
  ).rejects.toThrow()
  await expect(
    invoke('shutdown', { requestId: '00000000-0000-4000-8000-000000000000' })
  ).rejects.toThrow()
  expect(JSON.stringify(await invoke('status', { requestId: request.requestId }))).not.toContain(
    'secret-input'
  )
  await invoke('shutdown', { requestId: request.requestId })
  await wait(request.requestId, 'exited')
  setDesktopNotebookKernelForRpc(null)
  await expect(start()).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(start()).rejects.toMatchObject({ code: 'method_not_found' })
})
