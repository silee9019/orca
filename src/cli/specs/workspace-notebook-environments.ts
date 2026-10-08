import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_NOTEBOOK_ENVIRONMENT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['notebook', 'environments'],
    summary: 'Inspect Python environments on the desktop host',
    usage: 'orca notebook environments --params-file <file|-> --confirm <filePath> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {filePath, rootPath:null|string, runWorkspaceInterpreters?:false, expectedExecutionHostId:"local"}. Confirms the notebook file and validates a regular user-named file; a supplied root also requires existing desktop authorization.',
      'Reuses the original bounded interpreter discovery and 10-second probes. Workspace interpreters are inspected without running them unless runWorkspaceInterpreters:true; PATH interpreters are probed. This flag explicitly permits running discovered workspace executables. An empty list is not proof that no Python exists.',
      'Runs only on the selected desktop host; no SSH or client interpreter fallback. Missing desktop services and old peers fail explicitly.'
    ]
  },
  {
    path: ['notebook', 'describe-python'],
    summary: 'Probe a Python interpreter on the desktop host',
    usage: 'orca notebook describe-python --params-file <file|-> --confirm <path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {path, expectedExecutionHostId:"local"}. Confirm the interpreter path or command. Runs the existing fixed version/executable probe with its 10-second subprocess bound, not a kernel or notebook cell.',
      'Returns null for the existing unknown/failed-probe classification, not proof that the interpreter is absent. The client does not substitute its PATH or filesystem; old peers and missing desktop services fail.'
    ]
  },
  {
    path: ['notebook', 'create-venv'],
    summary: 'Prepare a notebook virtual environment on the desktop host',
    usage: 'orca notebook create-venv --params-file <file|-> --confirm <filePath> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {filePath, rootPath:null|string, python, expectedExecutionHostId:"local"}. Confirm the notebook. Uses original regular-file and root authorization, venv-parent policy, existing-interpreter protection, pip/ensurepip and final import/version checks. Creates .venv and may download packages.',
      'Uses the original 2-minute venv, 10-minute install-step and 10-second probe bounds, with a 35-minute CLI transport allowance. A failed request may leave partial environment files; there is no rollback or cancellation acknowledgement. Loss of client contact does not prove the operation stopped: inspect the selected host before retrying.',
      'No kernel is started. Fixed failure messages omit subprocess diagnostics. Native desktop host only, including folder workspaces; missing desktop service and old peers fail without SSH/client fallback.'
    ]
  },
  {
    path: ['notebook', 'install-ipykernel'],
    summary: 'Install and verify notebook kernel packages for a desktop interpreter',
    usage: 'orca notebook install-ipykernel --params-file <file|-> --confirm <python> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {python, expectedExecutionHostId:"local"}. Confirm the interpreter. Reuses pip install -U ipykernel, ensurepip fallback when needed and final ipykernel/jupyter_client import validation. Can download or update packages; does not start a kernel.',
      'Preserves 10-minute install steps and 10-second probes, with a 35-minute CLI transport allowance. Failed or disconnected calls can leave partial package changes; no rollback, cancellation or automatic retry is claimed. Fixed failures omit subprocess details. No SSH/client fallback; missing desktop services and old peers fail.'
    ]
  }
]
