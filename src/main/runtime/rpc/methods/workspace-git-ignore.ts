import {
  KNOWN_HUGE_FOLDER_NAMES,
  hugeFolderGitignoreAddition
} from '../../../../shared/git-huge-folder-ignore'
import { WorktreeSelector } from '../../../../shared/rpc-contract/git-params'
import { GitAppendGitignore } from '../../../../shared/rpc-contract/git-ignore-params'
import { isENOENT } from '../../../ipc/filesystem-path-containment'
import { defineMethod } from '../core'

export const WORKSPACE_GIT_IGNORE_METHODS = [
  defineMethod({
    name: 'git.findHugeFoldersToIgnore',
    params: WorktreeSelector,
    handler: async (params, { runtime }) => {
      const entries = await runtime.readFileExplorerDir(params.worktree, '')
      const existing = KNOWN_HUGE_FOLDER_NAMES.filter((name) =>
        entries.some((entry) => entry.name === name && entry.isDirectory)
      )
      if (existing.length === 0) {
        return []
      }
      const ignored = new Set(await runtime.checkRuntimeGitIgnoredPaths(params.worktree, existing))
      return existing.filter((name) => !ignored.has(name))
    }
  }),
  defineMethod({
    name: 'git.appendGitignore',
    params: GitAppendGitignore,
    handler: async (params, { runtime }) => {
      let content = ''
      const entries = await runtime.readFileExplorerDir(params.worktree, '')
      try {
        if (entries.some((entry) => entry.name === '.gitignore')) {
          const current = await runtime.readMobileFile(params.worktree, '.gitignore')
          if (current.truncated) {
            throw new Error('Git ignore file exceeds the supported read limit')
          }
          content = current.content
        }
      } catch (error) {
        if (!isENOENT(error)) {
          throw error
        }
      }
      const addition = hugeFolderGitignoreAddition(params.folderName, content)
      if (addition === null) {
        return { ok: true, changed: false }
      }
      await runtime.writeFileExplorerFileBase64Chunk(
        params.worktree,
        '.gitignore',
        Buffer.from(addition).toString('base64'),
        true,
        params.expectedSshConnectionGeneration,
        params.expectedSshTargetId,
        params.expectedExecutionHostId
      )
      return { ok: true, changed: true }
    }
  })
]
