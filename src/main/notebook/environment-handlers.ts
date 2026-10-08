import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import {
  resolveDesktopAuthorizedPath,
  resolveUserNamedRegularFile
} from '../ipc/local-file-access-resolution'
import {
  createNotebookVenv,
  describePython,
  installIpykernel,
  listPythonEnvironments
} from './python-environments'
import { notebookVenvParent } from '../../shared/notebook-venv-location'
import { setDesktopNotebookEnvironmentsForRpc } from '../runtime/rpc/methods/workspace-notebook-environments'

type EnvironmentListRequest = {
  filePath: string
  rootPath: string | null
  runWorkspaceInterpreters: boolean
}
type EnvironmentCreateRequest = { filePath: string; rootPath: string | null; python: string }
export function registerNotebookEnvironmentHandlers(store: Store): void {
  const list = async (args: EnvironmentListRequest) => {
    await resolveUserNamedRegularFile(args.filePath, store)
    return listPythonEnvironments(args.filePath, args.rootPath, {
      runWorkspaceInterpreters: args.runWorkspaceInterpreters === true
    })
  }
  const create = async (args: EnvironmentCreateRequest) => {
    await resolveUserNamedRegularFile(args.filePath, store)
    if (args.rootPath) {
      await resolveDesktopAuthorizedPath(args.rootPath, store)
    }
    return createNotebookVenv(args.python, notebookVenvParent(args.filePath, args.rootPath))
  }
  ipcMain.handle('notebook:listPythonEnvironments', (_event, args: EnvironmentListRequest) =>
    list(args)
  )
  ipcMain.handle('notebook:describePython', (_event, args: { path: string }) =>
    describePython(args.path)
  )
  ipcMain.handle('notebook:installIpykernel', (_event, args: { python: string }) =>
    installIpykernel(args.python)
  )
  ipcMain.handle('notebook:createVenv', (_event, args: EnvironmentCreateRequest) => create(args))
  setDesktopNotebookEnvironmentsForRpc({
    list: async (params) => {
      if (params.rootPath) {
        await resolveDesktopAuthorizedPath(params.rootPath, store)
      }
      return list(params)
    },
    describe: (params) => describePython(params.path),
    create,
    install: (params) => installIpykernel(params.python)
  })
}
