import { RuntimeClientError } from '../runtime-client'
import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { WorktreeSelector, FileOpen } from '../../shared/rpc-contract/files-target-params'
import {
  FileReadChunk,
  FileTreePath,
  FileSearch,
  FilePathSearch,
  FileListAll,
  FilePathsExist,
  ServerDirectoryBrowse,
  DocPreviewFileRead
} from '../../shared/rpc-contract/files-params'
import {
  FileWrite,
  FileWriteBase64,
  FileWriteBase64Chunk,
  FileMutationOpen,
  FileRename,
  FileCopy,
  FileDelete,
  FileCommitUpload
} from '../../shared/rpc-contract/files-mutation-params'

function requireMutationHost(params: { expectedExecutionHostId?: string }): void {
  if (!params.expectedExecutionHostId) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Invalid input: expectedExecutionHostId is required for file changes.'
    )
  }
}

export const WORKSPACE_FILE_HANDLERS: Record<string, CommandHandler> = {
  'file list': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorktreeSelector)
    const result = await ctx.client.call('files.list', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file read': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileOpen)
    const result = await ctx.client.call('files.read', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file preview': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileOpen)
    const result = await ctx.client.call('files.readPreview', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file read-chunk': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileReadChunk)
    const result = await ctx.client.call('files.readChunk', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file read-dir': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileTreePath)
    const result = await ctx.client.call('files.readDir', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file search': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileSearch)
    const result = await ctx.client.call('files.search', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file search-paths': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FilePathSearch)
    const result = await ctx.client.call('files.searchPaths', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file list-all': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileListAll)
    const result = await ctx.client.call('files.listAll', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file markdown-documents': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorktreeSelector)
    const result = await ctx.client.call('files.listMarkdownDocuments', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file exists': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FilePathsExist)
    const result = await ctx.client.call('files.pathsExist', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file stat': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileTreePath)
    const result = await ctx.client.call('files.stat', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file browse-server-dir': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ServerDirectoryBrowse)
    const result = await ctx.client.call('files.browseServerDir', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file read-doc-preview': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DocPreviewFileRead)
    const result = await ctx.client.call('files.readDocPreview', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file write': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileWrite)
    requireMutationHost(params)
    const result = await ctx.client.call('files.write', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file write-base64': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileWriteBase64)
    requireMutationHost(params)
    const result = await ctx.client.call('files.writeBase64', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file append-base64': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileWriteBase64Chunk)
    requireMutationHost(params)
    const result = await ctx.client.call('files.writeBase64Chunk', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file create': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileMutationOpen)
    requireMutationHost(params)
    const result = await ctx.client.call('files.createFile', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file mkdir': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileMutationOpen)
    requireMutationHost(params)
    const result = await ctx.client.call('files.createDirNoClobber', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file rename': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileRename)
    requireMutationHost(params)
    const result = await ctx.client.call('files.rename', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file copy': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileCopy)
    requireMutationHost(params)
    const result = await ctx.client.call('files.copy', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file delete': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileDelete)
    requireMutationHost(params)
    confirmWorkspaceCommand(ctx, params.worktree)
    const result = await ctx.client.call('files.delete', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'file commit-upload': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FileCommitUpload)
    requireMutationHost(params)
    const result = await ctx.client.call('files.commitUpload', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
