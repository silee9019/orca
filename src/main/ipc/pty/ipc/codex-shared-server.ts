import { getPtyIpc } from '../../pty-host-bindings'
import {
  createCodexPaneSharedServerCommands,
  type CodexPaneSharedServerDeps
} from '../../../codex/codex-pane-shared-server-commands'

export function installPtyCodexSharedServerIpcHandler(deps: CodexPaneSharedServerDeps): void {
  const commands = createCodexPaneSharedServerCommands(deps)
  getPtyIpc().handle('pty:isCodexOnSharedServer', (_event, args: { id: string }) =>
    commands.readStatus(args?.id)
  )
  getPtyIpc().handle('pty:disableCodexSharedServerAutoStart', (_event, args: { id: string }) =>
    commands.disableAutoStart(args?.id)
  )
  getPtyIpc().handle('pty:stopCodexSharedServer', (_event, args: { id: string }) =>
    commands.stop(args?.id)
  )
}
