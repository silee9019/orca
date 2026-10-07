import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript-api'
import { classifyActionSources } from './cli-action-classification.mjs'

const digest = (value) => createHash('sha256').update(value).digest('hex')
const text = (node, source) => node?.getText(source) ?? ''
const property = (node, name) =>
  node.properties?.find((item) => item.name && text(item.name).replace(/^['"]|['"]$/g, '') === name)
const value = (node, name, source) => text(property(node, name)?.initializer, source)
export const REQUIRED_SCOPES = [
  'plugin-commands',
  'plugin-panels',
  'runtime-generated-menus',
  'platform-and-flags',
  'jsx-spread-handlers'
]

export function collectActionSources(root) {
  const files = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'src'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    }
  )
    .split('\0')
    .filter(
      (file) =>
        /\.[cm]?[tj]sx?$/.test(file) &&
        !/(?:\.test\.|test-fixture|test-harness|\.spec\.)/.test(file)
    )
  const sources = []
  const occurrences = new Map()
  const add = (kind, key, node, source, detail) => {
    const file = relative(root, source.fileName).replaceAll('\\', '/')
    const base = `${kind}:${key ?? `${file}:${digest(detail).slice(0, 20)}`}`
    const occurrence = occurrences.get(base) ?? 0
    occurrences.set(base, occurrence + 1)
    let container = node.parent
    let component = file
      .split('/')
      .at(-1)
      .replace(/\.[^.]+$/, '')
    while (container) {
      if (
        (ts.isFunctionDeclaration(container) || ts.isFunctionExpression(container)) &&
        container.name
      ) {
        component = container.name.text
        break
      }
      if (
        ts.isVariableDeclaration(container) &&
        container.name &&
        !ts.isObjectBindingPattern(container.name)
      ) {
        component = text(container.name, source)
        break
      }
      container = container.parent
    }
    const calls = []
    const callOperations = []
    const findCalls = (item) => {
      if (ts.isCallExpression(item)) {
        const callee = text(item.expression, source)
        calls.push(callee)
        callOperations.push(
          item.arguments[0] && ts.isStringLiteral(item.arguments[0])
            ? `${callee}:${item.arguments[0].text}`
            : callee
        )
      }
      ts.forEachChild(item, findCalls)
    }
    findCalls(node)
    const title = property(node, 'title')?.initializer
    const click = property(node, 'click')?.initializer
    const clickCalls = []
    const findClickCalls = (item) => {
      if (ts.isCallExpression(item)) {
        const callee = text(item.expression, source)
        clickCalls.push(
          item.arguments[0] && ts.isStringLiteral(item.arguments[0])
            ? `${callee}:${item.arguments[0].text}`
            : callee
        )
      }
      ts.forEachChild(item, findClickCalls)
    }
    if (click) {
      findClickCalls(click)
    }
    sources.push({
      id: occurrence ? `${base}:${occurrence + 1}` : base,
      file,
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      fingerprint: digest(detail),
      component,
      calls: [...new Set(calls)],
      callOperations: [...new Set(callOperations)],
      declaredId: value(node, 'id', source) || value(node, 'targetSectionId', source),
      titleKey:
        title &&
        ts.isCallExpression(title) &&
        title.arguments[0] &&
        ts.isStringLiteral(title.arguments[0])
          ? title.arguments[0].text
          : text(title, source),
      menuOperation: click && ts.isIdentifier(click) ? click.text : clickCalls[0],
      detail
    })
  }
  for (const file of files) {
    const source = ts.createSourceFile(
      join(root, file),
      readFileSync(join(root, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true
    )
    if (source.parseDiagnostics.length) {
      throw new Error(`Cannot parse action source: ${file}`)
    }
    const visit = (node) => {
      if (
        file === 'src/shared/plugins/plugin-manifest.ts' &&
        ts.isVariableDeclaration(node) &&
        ['commandContributionSchema', 'panelContributionSchema'].includes(text(node.name, source))
      ) {
        add('registration', text(node.name, source), node, source, text(node, source))
      }
      if (ts.isObjectLiteralExpression(node)) {
        const field = (name) => value(node, name, source)
        const commandPath = property(node, 'path')?.initializer
        if (file.startsWith('src/cli/specs/') && commandPath) {
          if (
            !ts.isArrayLiteralExpression(commandPath) ||
            !commandPath.elements.every(ts.isStringLiteral)
          ) {
            throw new Error(`Unresolved CLI command path: ${file}:${field('path')}`)
          }
          add(
            'command',
            commandPath.elements.map((element) => element.text).join(' '),
            node,
            source,
            text(node, source)
          )
        }
        if (file.startsWith('src/shared/keybindings/definitions-core-') && property(node, 'id')) {
          add('shortcut', field('id'), node, source, text(node, source))
        }
        if (
          file.startsWith('src/main/menu/') &&
          ['role', 'click', 'action'].some((name) => property(node, name))
        ) {
          add('menu', null, node, source, text(node, source))
        }
        if (
          file.includes('settings-navigation-') &&
          property(node, 'id') &&
          property(node, 'searchEntries')
        ) {
          add('pane', `${file}:${field('id')}`, node, source, text(node, source))
        }
        if (/search/.test(file) && property(node, 'title')) {
          add('search', null, node, source, text(node, source))
        }
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        for (const attribute of node.attributes.properties) {
          if (ts.isJsxAttribute(attribute) && /^on[A-Z]/.test(text(attribute.name, source))) {
            add(
              'control',
              null,
              attribute,
              source,
              `${text(node.tagName, source)} ${text(attribute, source)}`
            )
          } else if (ts.isJsxSpreadAttribute(attribute)) {
            add(
              'control-spread',
              null,
              attribute,
              source,
              `${text(node.tagName, source)} ${text(attribute, source)}`
            )
          }
        }
      }
      if (ts.isStringLiteral(node) && node.text.startsWith('ui:')) {
        add('event', `${file}:${node.text}`, node, source, node.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  const program = ts.createProgram(
    [join(root, 'src/preload/api-types.ts'), join(root, 'src/shared/global-settings-types.ts')],
    {
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler
    }
  )
  const checker = program.getTypeChecker()
  for (const [file, name, kind] of [
    ['src/preload/api-types.ts', 'PreloadApi', 'api'],
    ['src/shared/global-settings-types.ts', 'GlobalSettings', 'setting']
  ]) {
    const source = program.getSourceFile(join(root, file))
    const declaration = source?.statements.find((node) => node.name?.text === name)
    if (!declaration) {
      throw new Error(`Missing source type: ${name}`)
    }
    const walk = (type, prefix, depth) => {
      for (const symbol of checker.getPropertiesOfType(type)) {
        const node = symbol.valueDeclaration ?? symbol.declarations?.[0]
        if (!node) {
          throw new Error(`Missing declaration: ${prefix}.${symbol.name}`)
        }
        const member = checker.getTypeOfSymbolAtLocation(symbol, node)
        const key = prefix ? `${prefix}.${symbol.name}` : symbol.name
        if (
          kind === 'setting' ||
          checker.getSignaturesOfType(member, ts.SignatureKind.Call).length
        ) {
          add(
            kind,
            key,
            node,
            node.getSourceFile(),
            `${key}: ${checker.typeToString(member, undefined, ts.TypeFormatFlags.NoTruncation)}`
          )
        } else if (depth < 2) {
          walk(member, key, depth + 1)
        } else {
          throw new Error(`Unresolved nested API: ${key}`)
        }
      }
    }
    walk(checker.getTypeAtLocation(declaration), '', 0)
  }
  const imports = program
    .getSemanticDiagnostics()
    .filter((item) => [2307, 7016].includes(item.code))
  if (imports.length) {
    throw new Error(`Unresolved action-type imports: ${imports.length}`)
  }
  return sources.sort((a, b) => a.id.localeCompare(b.id))
}

export function assessActionCoverage(sources, ledger, final = false) {
  const errors = []
  if (!sources.length) {
    errors.push('Empty source inventory')
  }
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const actions = new Set()
  const bundles = new Set()
  const bindings = new Map()
  const support = {}
  const evidence = {}
  const commandIds = new Set(
    sources.filter((source) => source.id.startsWith('command:')).map((source) => source.id.slice(8))
  )
  for (const bundle of ledger.bundles) {
    if (!bundle.id || bundles.has(bundle.id)) {
      errors.push(`Duplicate or empty bundle: ${bundle.id}`)
    }
    bundles.add(bundle.id)
  }
  for (const action of ledger.actions) {
    if (!action.id || actions.has(action.id)) {
      errors.push(`Duplicate or empty action: ${action.id}`)
    }
    actions.add(action.id)
    if (!bundles.has(action.bundle)) {
      errors.push(`Unknown bundle: ${action.id}`)
    }
    for (const field of ['effect', 'owner', 'host', 'viewer', 'gap', 'verification']) {
      if (typeof action[field] !== 'string' || !action[field].trim()) {
        errors.push(`Missing ${field}: ${action.id}`)
      }
    }
    if (!Number.isInteger(action.phase) || action.phase < 1 || action.phase > 9) {
      errors.push(`Invalid phase: ${action.id}`)
    }
    if (!['gap', 'implemented', 'alias', 'human-procedure', 'internal'].includes(action.support)) {
      errors.push(`Invalid support: ${action.id}`)
    }
    if (!['unverified', 'partial', 'verified'].includes(action.evidence)) {
      errors.push(`Invalid evidence: ${action.id}`)
    }
    if (
      ['implemented', 'alias', 'human-procedure'].includes(action.support) &&
      !commandIds.has(action.command)
    ) {
      errors.push(`Missing command: ${action.id}`)
    }
    if (
      action.support === 'internal' &&
      !ledger.actions.some((parent) => parent.id === action.parent && parent.id !== action.id)
    ) {
      errors.push(`Missing parent action: ${action.id}`)
    }
    if (action.evidence === 'verified' && !action.evidencePaths?.length) {
      errors.push(`Missing execution evidence: ${action.id}`)
    }
    if (
      !action.sources?.length &&
      !(action.derivedFrom?.length && action.derivedFrom.every((id) => sourceById.has(id)))
    ) {
      errors.push(`No source: ${action.id}`)
    }
    for (const binding of action.sources ?? []) {
      const source = sourceById.get(binding.id)
      if (!source) {
        errors.push(`Stale source: ${binding.id}`)
      } else if (source.fingerprint !== binding.fingerprint) {
        errors.push(`Changed source: ${binding.id}`)
      }
      const linked = bindings.get(binding.id) ?? []
      linked.push(action.id)
      bindings.set(binding.id, linked)
    }
    support[action.support] = (support[action.support] ?? 0) + 1
    evidence[action.evidence] = (evidence[action.evidence] ?? 0) + 1
    if (final && (action.support === 'gap' || action.evidence !== 'verified')) {
      errors.push(`Incomplete action: ${action.id}`)
    }
  }
  if (!actions.size) {
    errors.push('Empty action classification')
  }
  for (const scope of ledger.scopes) {
    if (scope.status !== 'classified' || !scope.boundary || !scope.fixture) {
      errors.push(`Unclassified scope: ${scope.id}`)
    }
  }
  for (const id of REQUIRED_SCOPES) {
    if (!ledger.scopes.some((scope) => scope.id === id)) {
      errors.push(`Missing scope: ${id}`)
    }
  }
  const unclassified = sources
    .filter((source) => !bindings.has(source.id))
    .map((source) => source.id)
  if (unclassified.length) {
    errors.push(`Unclassified sources: ${unclassified.length}`)
  }
  const duplicateBindings = [...bindings].filter(([, ids]) => ids.length > 1).map(([id]) => id)
  if (duplicateBindings.length) {
    errors.push(`Duplicate source ownership: ${duplicateBindings.length}`)
  }
  return {
    sourceCount: sources.length,
    actionCount: actions.size,
    bundleCount: bundles.size,
    support,
    evidence,
    unclassified,
    duplicateBindings,
    errors
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '..', '..')
  const sources = collectActionSources(root)
  if (process.argv.includes('--sources')) {
    console.log(JSON.stringify(sources, null, 2))
  } else {
    const ledger = JSON.parse(readFileSync(join(root, 'config/cli-action-coverage.json'), 'utf8'))
    const classified = classifyActionSources(sources, ledger)
    const result = assessActionCoverage(sources, classified, process.argv.includes('--final'))
    result.ruleCounts = classified.ruleCounts
    result.bundleCounts = Object.fromEntries(
      classified.bundles.map((bundle) => [
        bundle.id,
        classified.actions.filter((action) => action.bundle === bundle.id).length
      ])
    )
    if (process.argv.includes('--classified')) {
      console.log(JSON.stringify(classified, null, 2))
    } else {
      console.log(JSON.stringify(result, null, 2))
    }
    if (result.errors.length) {
      process.exitCode = 1
    }
  }
}
