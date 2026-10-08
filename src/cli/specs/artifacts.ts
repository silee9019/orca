import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const CLOUD_FLAGS = ['api-url']

export const ARTIFACT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['artifacts', 'viewer'],
    summary: 'Read or change the mounted desktop artifact viewer and await its committed state',
    usage: 'orca artifacts viewer --viewer desktop --input-file <action.json> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'input-file', 'input-stdin'],
    examples: ['orca artifacts viewer --viewer desktop --input-file action.json --json']
  },
  {
    path: ['artifacts', 'share'],
    summary: 'Share an HTML or Markdown file with your Orca account',
    usage: 'orca artifacts share <file> [--api-url <url>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...CLOUD_FLAGS, 'file'],
    positionalArgs: ['file'],
    examples: ['orca artifacts share ./report.html', 'orca artifacts share ./notes.md --json']
  },
  {
    path: ['artifacts', 'update'],
    summary: 'Update a file previously shared from this Orca profile',
    usage: 'orca artifacts update <file> [--api-url <url>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...CLOUD_FLAGS, 'file'],
    positionalArgs: ['file']
  },
  {
    path: ['artifacts', 'unshare'],
    destructive: true,
    summary: 'Delete the artifact associated with a previously shared file',
    usage: 'orca artifacts unshare <file> [--api-url <url>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...CLOUD_FLAGS, 'file'],
    positionalArgs: ['file']
  },
  {
    path: ['artifacts', 'list'],
    summary: 'List owned artifacts; query and exact id filter only the requested page',
    usage:
      'orca artifacts list [--cursor <cursor>] [--query <text>] [--id <slug>] [--api-url <url>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...CLOUD_FLAGS, 'cursor', 'query', 'id']
  },
  {
    path: ['artifacts', 'delete'],
    aliases: [['artifacts', 'rm']],
    destructive: true,
    summary: 'Delete an artifact owned by the signed-in Orca account',
    usage: 'orca artifacts delete <id> [--api-url <url>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...CLOUD_FLAGS, 'id'],
    positionalArgs: ['id']
  }
]
