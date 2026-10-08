import { getRequiredStringFlag } from '../flags'
export function readBrowserClientTargetFlags(flags: Map<string, string | boolean>) {
  return {
    worktreeId: getRequiredStringFlag(flags, 'worktree'),
    page: getRequiredStringFlag(flags, 'page'),
    environmentId: getRequiredStringFlag(flags, 'runtime-environment'),
    remotePageId: getRequiredStringFlag(flags, 'remote-page'),
    browserHostClientId: getRequiredStringFlag(flags, 'browser-client'),
    browserHostGeneration: Number(getRequiredStringFlag(flags, 'browser-host-generation')),
    pageHostGeneration: Number(getRequiredStringFlag(flags, 'page-host-generation'))
  }
}
