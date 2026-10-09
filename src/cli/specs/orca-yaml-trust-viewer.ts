import { GLOBAL_FLAGS, type CommandSpec } from '../args'
import { ORCA_YAML_TRUST_SCRIPT_KINDS } from '../../shared/rpc-contract/orca-yaml-trust-viewer-params'

export const ORCA_YAML_TRUST_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'orca-yaml-trust', 'get'],
    aliases: [['ui', 'orca-yaml-trust', 'show']],
    summary: 'Read which orca.yaml script trust prompt is open in the host viewer',
    usage: 'orca ui orca-yaml-trust get --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer'],
    notes: [
      'Reads only, so applied is true even when no prompt is showing: read open and rendered.open to tell. prompt is null when none is open.',
      'The prompt names the repository, the script kind and the script hash. The script text is not returned: read it from the repository.',
      'A prompt that has just opened may not be reported until its dialog has loaded; read again.'
    ]
  },
  {
    path: ['ui', 'orca-yaml-trust', 'skip'],
    summary: 'Decline the open orca.yaml script trust prompt (the dialog\'s "Don\'t run")',
    usage:
      'orca ui orca-yaml-trust skip --viewer host [--repo <id>] [--script-kind <kind>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'repo', 'script-kind'],
    // Why: both flags are single-valued; marking them repeatable makes a repeat reach validation instead of silently keeping the last.
    repeatableFlags: ['repo', 'script-kind'],
    notes: [
      "Declines the way the dialog's Don't run button and Escape do: the script that asked is told not to run and nothing new is trusted. There is no command to run the script or trust a repository.",
      'Needs a prompt showing; otherwise it is refused with orca_yaml_trust_unavailable. With --repo or --script-kind, a different open prompt is refused with orca_yaml_trust_mismatch. Take both values from get.',
      `Script kinds: ${ORCA_YAML_TRUST_SCRIPT_KINDS.join(', ')}.`,
      'Nothing is written, so writeOutcome is not_requested. If another prompt takes its place, even one for the same script, open and rendered describe that one.',
      'Refused with viewer_runtime_mismatch while the desktop is controlling a remote runtime.'
    ]
  }
]
