import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_NOTEBOOK_KERNEL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['notebook', 'kernel-start'],
    summary: 'Start a CLI-owned native notebook kernel',
    usage:
      'orca notebook kernel-start --params-file <file|-> --confirm <local:filePath:python> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",expectedKernelHostId:"local",filePath,python}. Absolute native file and interpreter paths only; WSL/SSH/caller owner/sender/argv are rejected. Uses the original regular-file resolution, real document directory, notebook bridge and kernel parser. No fake renderer event or renderer kernel replacement.',
      'Returns requestId, not ready. One CLI kernel slot until original exited promise settles. Startup deadline 60 seconds; inactivity 15 minutes requests shutdown. Status/frame/control access renews idle lifetime. Missing ipykernel is explicit; packages are never installed here. Old peers/missing Desktop service fail explicitly.'
    ]
  },
  {
    path: ['notebook', 'kernel-status'],
    summary: 'Read a CLI notebook kernel state',
    usage: 'orca notebook kernel-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. Distinguishes pending/ready/missing-ipykernel/failed/stopping/cancelled/exited. executionVerdict is exited only after the original bridge close promise. Raw startup errors and code are not retained in status.'
    ]
  },
  {
    path: ['notebook', 'kernel-execute'],
    summary: 'Submit one cell to a CLI-owned notebook kernel',
    usage: 'orca notebook kernel-execute --params-file <file|-> --confirm <requestId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId,code}. Code is read from stdin/file and sent to the original notebook bridge, never kept in request metadata. Maximum 1MiB text. Ready kernel and no current execution required; original done frame releases the slot. accepted is not execution success; read kernel-frames.'
    ]
  },
  {
    path: ['notebook', 'kernel-interrupt'],
    summary: 'Request interrupt for a CLI-owned notebook kernel',
    usage: 'orca notebook kernel-interrupt --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. Uses original kernel interrupt command. Acknowledges submission only; inspect done/error frames. Never targets renderer-owned kernels.'
    ]
  },
  {
    path: ['notebook', 'kernel-shutdown'],
    summary: 'Request shutdown for a CLI-owned notebook kernel',
    usage: 'orca notebook kernel-shutdown --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. Cancels pending startup or invokes original shutdown/force-termination grace. stopping is not exited; the slot stays occupied until original exited promise settles. Renderer kernels remain separate.'
    ]
  },
  {
    path: ['notebook', 'kernel-frames'],
    summary: 'Read bounded original notebook output frames by cursor',
    usage: 'orca notebook kernel-frames --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId,afterSequence?,limit?}. Sequence starts at1; page at most100 frames, retained at most500frames/1MiB. Dropped frames/truncated cursor are explicit. CLI parser limits each line to1MiB and shuts down damaged protocol; original renderer defaults remain unchanged. Output contains notebook-produced content; exit stderr detail is discarded. This polls the CLI kernel producer, not a renderer event subscription.'
    ]
  }
]
