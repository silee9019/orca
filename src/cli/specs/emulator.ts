import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const EMULATOR_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['emulator', 'focus-group'],
    summary: 'Focus the exact owning group of an existing simulator tab',
    usage: 'orca emulator focus-group --worktree <selector> --tab-id <id> --group-id <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'tab-id', 'group-id']
  },
  {
    path: ['emulator', 'select-tab'],
    summary: 'Select an exact simulator tab through the existing Palette owner',
    usage:
      'orca emulator select-tab --worktree <selector> --tab-id <id> --execution-host <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'tab-id', 'execution-host']
  },
  {
    path: ['emulator', 'screen-key'],
    summary: 'Send a key through the existing screen capture owner',
    usage:
      'orca emulator screen-key --worktree <selector> --tab-id <id> --key <value> --shift [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'tab-id', 'key', 'shift']
  },
  {
    path: ['emulator', 'screen-paste'],
    summary: 'Paste through the existing screen capture, batching and cancellation owner',
    usage:
      'orca emulator screen-paste --worktree <selector> --tab-id <id> --text <value> --text-stdin [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'tab-id', 'text', 'text-stdin']
  },
  {
    path: ['emulator', 'rotate-view'],
    summary: 'Rotate through the pane owner and update its visual orientation',
    usage: 'orca emulator rotate-view --worktree <selector> --tab-id <id>  [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'tab-id']
  },
  {
    path: ['emulator', 'wheel'],
    summary: 'Scroll an existing emulator viewer using its wheel input owner',
    usage:
      'orca emulator wheel --worktree <selector> --tab-id <id> --x <pixels> --y <pixels> --delta-y <pixels> [--delta-x <pixels>] [--delta-mode <0|1|2>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'worktree',
      'tab-id',
      'x',
      'y',
      'delta-x',
      'delta-y',
      'delta-mode'
    ]
  },
  {
    path: ['emulator', 'focus'],
    summary: 'Focus the host viewer simulator pane and await rendered state read-back',
    usage: 'orca emulator focus --worktree <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['emulator', 'key'],
    summary: 'Send a named or printable key using the active device control stream',
    usage: 'orca emulator key <key> --worktree <selector> [--shift] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'key', 'worktree', 'shift'],
    positionalArgs: ['key']
  },
  {
    path: ['emulator', 'control'],
    summary: 'Run bounded key, touch, wait and blur events with held input released on completion',
    usage: 'orca emulator control (--text <json> | --text-stdin) --worktree <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'text', 'text-stdin', 'worktree']
  },
  {
    path: ['emulator', 'stream'],
    summary: 'Stream JSON frame events until the duration expires or SIGINT cancels observation',
    usage:
      'orca emulator stream --codec <mjpeg|h264> --worktree <selector> [--timeout-ms <1..60000>]',
    allowedFlags: [...GLOBAL_FLAGS, 'codec', 'worktree', 'timeout-ms']
  },
  {
    path: ['emulator', 'observe'],
    summary: 'Capture a JPEG frame or an H264 keyframe with codec metadata from the active device',
    usage: 'orca emulator observe --worktree <selector> [--timeout-ms <1..60000>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'timeout-ms']
  },
  {
    path: ['emulator', 'availability'],
    summary: 'Check emulator backend availability on the execution host',
    usage: 'orca emulator availability [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['emulator', 'simulators'],
    summary: 'List iOS simulators on the execution host',
    usage: 'orca emulator simulators [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['emulator', 'detach'],
    summary: 'Remove the workspace active-device association without stopping the device',
    usage: 'orca emulator detach --worktree <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['emulator', 'list'],
    summary: 'List available/running emulators (Orca-managed + raw serve-sim)',
    usage: 'orca emulator list [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['emulator', 'devices'],
    summary: 'List all emulator devices/AVDs across iOS and Android',
    usage: 'orca emulator devices [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['emulator', 'attach'],
    summary: 'Attach/start helper for a device and make it active for the worktree',
    usage: 'orca emulator attach [device] [--worktree <selector>] [--focus] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'focus', 'device'],
    positionalArgs: ['device']
  },
  {
    path: ['emulator', 'tap'],
    summary: 'Tap at normalized 0..1 coords (preferred for single taps)',
    usage: 'orca emulator tap <x> <y> [--device <id>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'device', 'emulator', 'worktree', 'x', 'y'],
    positionalArgs: ['x', 'y']
  },
  {
    path: ['emulator', 'type'],
    summary: 'Type text (US ASCII only)',
    usage:
      'orca emulator type (<text> | --text-stdin) [--device <id>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'text', 'text-stdin', 'device', 'emulator', 'worktree'],
    positionalArgs: ['text']
  },
  {
    path: ['emulator', 'gesture'],
    summary: 'Send a multi-point gesture sequence',
    usage: "orca emulator gesture '<json>' [--device <id>] [--worktree <selector>] [--json]",
    allowedFlags: [...GLOBAL_FLAGS, 'points', 'device', 'emulator', 'worktree'],
    positionalArgs: ['points']
  },
  {
    path: ['emulator', 'button'],
    summary: 'Hardware button (home, side_button, etc.)',
    usage: 'orca emulator button <name> [--device <id>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'device', 'emulator', 'worktree', 'name'],
    positionalArgs: ['name']
  },
  {
    path: ['emulator', 'rotate'],
    summary: 'Rotate device',
    usage: 'orca emulator rotate <orientation> [--device <id>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'device', 'emulator', 'worktree', 'orientation'],
    positionalArgs: ['orientation']
  },
  {
    path: ['emulator', 'exec'],
    summary:
      'Raw passthrough (e.g. orca emulator exec --command "tap 0.5 0.7" or "ca-debug blended on")',
    usage: 'orca emulator exec --command <cmd> [--device <id>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'command', 'device', 'emulator', 'worktree']
  },
  {
    path: ['emulator', 'kill'],
    summary: 'Stop helper for device',
    usage: 'orca emulator kill [--device <id>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'device', 'emulator', 'worktree']
  },
  {
    path: ['emulator', 'shutdown'],
    summary: 'Stop helper and shut down the simulator device',
    usage:
      'orca emulator shutdown [--device <id>] [--emulator <id>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'device', 'emulator', 'worktree']
  },
  {
    path: ['emulator', 'install'],
    summary: 'Install an APK onto the target Android device',
    usage: 'orca emulator install <apkPath> [--reinstall] [--device <id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'device', 'emulator', 'worktree', 'path', 'reinstall'],
    positionalArgs: ['path']
  },
  {
    path: ['emulator', 'launch'],
    summary: 'Launch an Android app by package (and optional activity)',
    usage: 'orca emulator launch <package> [--activity <name>] [--device <id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'device', 'emulator', 'worktree', 'package', 'activity'],
    positionalArgs: ['package']
  },
  {
    path: ['emulator', 'permissions'],
    summary: 'Grant/revoke an Android runtime permission, or reset all runtime grants',
    usage:
      'orca emulator permissions <grant|revoke> <package> <permission> [--device <id>] [--json]\n       orca emulator permissions reset [--device <id>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'device',
      'emulator',
      'worktree',
      'op',
      'package',
      'permission'
    ],
    positionalArgs: ['op', 'package', 'permission']
  },
  {
    path: ['emulator', 'ax'],
    summary: 'Dump the accessibility tree (Android uiautomator; iOS serve-sim AX, frames 0..1)',
    usage: 'orca emulator ax [--device <id>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'device', 'emulator', 'worktree']
  },
  {
    path: ['emulator', 'logcat'],
    summary: 'Capture a one-shot logcat dump from the Android device',
    usage: 'orca emulator logcat [--lines <n>] [--device <id>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'device', 'emulator', 'worktree', 'lines']
  }
]
