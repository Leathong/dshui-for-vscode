/**
 * Rollback review with the VS Code native diff editor.
 *
 * The extension asks the dsh rollback plugin for the current session list
 * (`rollback/sessionChanges`), builds two virtual documents (the baseline
 * original and the current modified side) and opens them with the built-in
 * `vscode.diff` command. Accept / Undo are clickable CodeLens buttons on the
 * modified side of the diff, plus editor context-menu commands — both scoped
 * to the `dshui-rollback` scheme so they only appear inside our virtual
 * documents, never in normal files.
 *
 * CodeLens inside the diff editor requires the `diffEditor.codeLens` setting;
 * the extension flips its default to `true` via `configurationDefaults` in
 * package.json (users can still turn it off).
 *
 * RPC wire format:
 *   POST /api/rollback/<method>
 *   { type: 'client-request', rpcId, method: 'rollback/<method>',
 *     payload: { args: { ...wire fields } } }
 */
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as vscode from 'vscode'

export const ROLLBACK_SCHEME = 'dshui-rollback'

export interface RollbackHunk {
  oldText: string | null
  newText: string
  oldLine?: number
  newLine?: number
  endLine?: number
  /** First changed line inside the hunk (after the context prefix), 1-based — anchors the CodeLens buttons on the change itself. */
  firstChangedOldLine?: number
  firstChangedNewLine?: number
}

export interface RollbackFileChange {
  path: string
  absolutePath: string
  status: 'modified' | 'deleted' | 'created' | 'typechange' | 'ignored' | 'binary' | 'nested-repo'
  source: 'git' | 'ledger'
  restorable: boolean
  accepted?: boolean
  truncated?: boolean
  binary?: boolean
  hunks?: RollbackHunk[]
  toolCalls?: Array<{
    callId: string
    toolName: string
    turn: number
    step: number
    seq: number
    hunks: RollbackHunk[]
  }>
}

export interface RollbackModification {
  modificationId: string
  toolName: 'write' | 'edit'
  path: string
  turn: number
  step: number
  seq: number
  hunks: RollbackHunk[]
  restorable: 'merge' | 'file-only' | 'unsupported'
  accepted?: boolean
  reason?: string
  createdFile?: boolean
  laterModificationIds?: string[]
}

export interface RollbackSessionChangesValue {
  listId: string
  baseline?: { turn: number }
  changes: RollbackFileChange[]
  modifications: RollbackModification[]
  acceptedFiles: string[]
  acceptedModifications: string[]
  warnings: string[]
}

interface RpcFailure {
  code: string
  message: string
}

type RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcFailure }

interface ReviewState {
  id: string
  kind: 'file' | 'modification'
  port: number
  sessionId: string
  listId: string
  path: string
  modificationId?: string
  original: string
  modified: string
  /** Language id of the real file, when it can be detected (syntax highlighting in the diff). */
  language?: string
  /**
   * 1-based anchor lines for the Accept/Undo CodeLens buttons, per diff side.
   * Git/ledger hunks carry the hunk start line (`newLine` in the new file,
   * `oldLine` in the old file); for deleted files the modified side is empty,
   * so the buttons anchor on the original side instead.
   */
  anchors: Array<{ side: 'orig' | 'mod'; line: number }>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const isZh = vscode.env.language.toLowerCase().startsWith('zh')
function L(en: string, zh: string): string {
  return isZh ? zh : en
}

/**
 * Call one dsh Typert Remote method through the embedded server's HTTP /api
 * bridge. Transport failures are folded into a RollbackResult-style failure.
 */
export async function rollbackRpc<T>(port: number, endpoint: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  const rpcId = crypto.randomUUID()
  const message = {
    type: 'client-request',
    rpcId,
    method: endpoint,
    payload: { args },
  }
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, 30_000)
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
      signal: controller.signal,
    })
    if (!response.ok) {
      return { ok: false, error: { code: 'transport', message: `HTTP ${response.status}` } }
    }
    const full = await response.json() as { result?: unknown }
    if (!isObject(full) || !isObject(full.result) || typeof full.result.ok !== 'boolean') {
      return { ok: false, error: { code: 'transport', message: 'invalid server response' } }
    }
    return full.result as RpcResult<T>
  } catch (error) {
    return { ok: false, error: { code: 'transport', message: error instanceof Error ? error.message : String(error) } }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Call one rollback Remote method and unwrap its business RollbackResult so
 * callers see a single failure shape.
 */
async function rollbackCall<T>(port: number, endpoint: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  const remote = await rollbackRpc<{ ok: true; value: T } | { ok: false; error: RpcFailure }>(port, endpoint, args)
  if (!remote.ok) return { ok: false, error: remote.error }
  const business = remote.value
  if (!business.ok) return { ok: false, error: business.error }
  return { ok: true, value: business.value }
}

async function rollbackSessionChanges(port: number, sessionId: string): Promise<RpcResult<RollbackSessionChangesValue>> {
  return rollbackCall<RollbackSessionChangesValue>(port, 'rollback/sessionChanges', { sessionId })
}

function detectEol(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

function normalizeLf(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function hunkLineCount(text: string | null): number {
  if (text === null || text === '') return 0
  return text.split('\n').length
}

function readFileText(abs: string): string | null {
  try {
    const buffer = fs.readFileSync(abs)
    if (buffer.includes(0)) return null
    return buffer.toString('utf8')
  } catch {
    return null
  }
}

/**
 * Reconstruct the baseline (original) side for an existing modified file by
 * reverse-applying the git/ledger diff hunks to the current file. Hunks are
 * applied from bottom to top so line numbers stay valid.
 */
function reverseApplyHunks(current: string, hunks: readonly RollbackHunk[]): string {
  const eol = detectEol(current)
  const lines = normalizeLf(current).split('\n')
  const sorted = [...hunks]
    .filter(hunk => hunk.newLine !== undefined)
    .sort((a, b) => (a.newLine ?? 0) - (b.newLine ?? 0))
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const hunk = sorted[i]!
    const start = (hunk.newLine ?? 1) - 1
    if (start < 0 || start > lines.length) continue
    const newCount = hunk.endLine !== undefined
      ? hunk.endLine - (hunk.newLine ?? start + 1) + 1
      : hunkLineCount(hunk.newText)
    const oldLines = hunk.oldText === null || hunk.oldText === '' ? [] : normalizeLf(hunk.oldText).split('\n')
    const remove = Math.max(0, Math.min(newCount, lines.length - start))
    lines.splice(start, remove, ...oldLines)
  }
  return lines.join(eol)
}

function joinHunkText(hunks: readonly RollbackHunk[], side: 'old' | 'new'): string {
  return hunks
    .map(hunk => side === 'old' ? (hunk.oldText ?? '') : hunk.newText)
    .join('\n')
}

/** Build original/current texts for the file-level native diff. */
function buildFileDiffTexts(change: RollbackFileChange): { original: string; modified: string } {
  const hunks = change.hunks ?? []

  if (change.status === 'created') {
    const current = readFileText(change.absolutePath)
    return { original: '', modified: current ?? joinHunkText(hunks, 'new') }
  }

  if (change.status === 'deleted') {
    return { original: joinHunkText(hunks, 'old'), modified: '' }
  }

  if (hunks.length > 0 && change.binary !== true && change.truncated !== true) {
    const current = readFileText(change.absolutePath)
    if (current !== null) {
      return { original: reverseApplyHunks(current, hunks), modified: current }
    }
  }

  return { original: joinHunkText(hunks, 'old'), modified: joinHunkText(hunks, 'new') }
}

function parseReviewId(uri: vscode.Uri): string | undefined {
  if (uri.scheme !== ROLLBACK_SCHEME) return undefined
  const segments = uri.path.split('/').filter(segment => segment !== '')
  const id = segments[0]
  return id === undefined || id === '' ? undefined : decodeURIComponent(id)
}

function isOriginalSide(uri: vscode.Uri): boolean {
  return uri.query.includes('side=orig')
}

/**
 * Detect the language id of the real file so the virtual diff documents get
 * real syntax highlighting. Loading the file with `openTextDocument` does not
 * show an editor tab; failure (missing/deleted/binary) means plaintext.
 */
async function detectLanguage(absPath: string): Promise<string | undefined> {
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath))
    return doc.languageId === 'plaintext' ? undefined : doc.languageId
  } catch {
    return undefined
  }
}

/**
 * Map hunks to CodeLens anchor lines on one diff side. Prefers the first
 * changed line inside each hunk (`firstChanged*Line`) so the buttons stick to
 * the change itself rather than the hunk's context prefix; falls back to the
 * hunk start line. Hunks without any line info are skipped — if nothing
 * usable remains, callers fall back to the top of the modified side.
 */
function hunkAnchors(hunks: readonly RollbackHunk[], side: 'orig' | 'mod'): Array<{ side: 'orig' | 'mod'; line: number }> {
  const anchors: Array<{ side: 'orig' | 'mod'; line: number }> = []
  for (const hunk of hunks) {
    const line = side === 'orig'
      ? hunk.firstChangedOldLine ?? hunk.oldLine
      : hunk.firstChangedNewLine ?? hunk.newLine
    if (line === undefined || line < 1) continue
    anchors.push({ side, line })
  }
  return anchors
}

/**
 * Anchors for a modification-level diff: its document is the concatenation of
 * the hunk texts (`joinHunkText`), so file line numbers do not apply. Each
 * hunk's region starts after the previous hunks' `newText` line counts.
 */
function patchDocAnchors(hunks: readonly RollbackHunk[]): Array<{ side: 'orig' | 'mod'; line: number }> {
  const anchors: Array<{ side: 'orig' | 'mod'; line: number }> = []
  let cursor = 0
  for (const hunk of hunks) {
    const lines = hunkLineCount(hunk.newText)
    if (lines > 0) anchors.push({ side: 'mod', line: cursor + 1 })
    cursor += lines + 1 // +1 for the '\n' separator used by joinHunkText
  }
  return anchors
}

export class RollbackReviewManager {
  private readonly states = new Map<string, ReviewState>()
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>()
  private readonly provider: vscode.TextDocumentContentProvider
  private readonly providerRegistration: vscode.Disposable
  private readonly codelensRegistration: vscode.Disposable
  private readonly commandRegistrations: vscode.Disposable[]
  /** Called after a successful accept/undo so the sidebar dock refreshes too. */
  onDidChange?: () => void

  constructor() {
    this.provider = {
      onDidChange: this.emitter.event,
      provideTextDocumentContent: (uri) => {
        const id = parseReviewId(uri)
        if (id === undefined) return ''
        const state = this.states.get(id)
        if (state === undefined) return ''
        return isOriginalSide(uri) ? state.original : state.modified
      },
    }
    this.providerRegistration = vscode.workspace.registerTextDocumentContentProvider(ROLLBACK_SCHEME, this.provider)
    // CodeLens is scoped by the DocumentSelector's scheme filter: it only ever
    // fires for our virtual review documents, never for real files (no custom
    // language registration needed). Rendering inside the diff editor is gated
    // by the `diffEditor.codeLens` setting, whose default this extension flips
    // to `true` through contributes.configurationDefaults.
    this.codelensRegistration = vscode.languages.registerCodeLensProvider(
      { scheme: ROLLBACK_SCHEME },
      {
        provideCodeLenses: (document) => {
          const id = parseReviewId(document.uri)
          if (id === undefined) return []
          const state = this.states.get(id)
          if (state === undefined) return []
          const side = isOriginalSide(document.uri) ? 'orig' : 'mod'
          // One button row per hunk, on the side whose line numbers the hunks
          // describe. Anchors that fall outside the document (degraded diff
          // where the hunk positions no longer match the shown text) are
          // dropped.
          const lines = new Set<number>()
          for (const anchor of state.anchors) {
            if (anchor.side !== side) continue
            if (anchor.line >= 1 && anchor.line <= document.lineCount) lines.add(anchor.line)
          }
          // No usable hunk positions at all (e.g. hunk without line numbers):
          // fall back to the top of the modified side.
          if (lines.size === 0 && state.anchors.length === 0 && side === 'mod' && document.lineCount > 0) {
            lines.add(1)
          }
          const lenses: vscode.CodeLens[] = []
          for (const line of [...lines].sort((a, b) => a - b)) {
            const position = new vscode.Range(line - 1, 0, line - 1, 0)
            lenses.push(new vscode.CodeLens(position, {
              command: 'dshui.rollback.accept',
              title: `$(check) ${L('Accept', '接受')}`,
              // Pass the state id so the command resolves this diff directly
              // instead of guessing from the active editor.
              arguments: [id],
            }))
            lenses.push(new vscode.CodeLens(position, {
              command: 'dshui.rollback.undo',
              title: `$(undo) ${L('Undo', '撤销')}`,
              arguments: [id],
            }))
          }
          return lenses
        },
      },
    )
    this.commandRegistrations = [
      vscode.commands.registerCommand('dshui.rollback.accept', (stateId?: unknown) => {
        void this.handleReviewCommand('accept', typeof stateId === 'string' ? stateId : undefined)
      }),
      vscode.commands.registerCommand('dshui.rollback.undo', (stateId?: unknown) => {
        void this.handleReviewCommand('undo', typeof stateId === 'string' ? stateId : undefined)
      }),
    ]
  }

  dispose(): void {
    this.providerRegistration.dispose()
    this.codelensRegistration.dispose()
    for (const registration of this.commandRegistrations) registration.dispose()
    this.states.clear()
  }

  /** Open the native file-level diff for one unaccepted file. */
  async showFile(port: number, sessionId: string, path: string): Promise<void> {
    const remote = await rollbackSessionChanges(port, sessionId)
    if (!remote.ok) {
      void vscode.window.showErrorMessage(`dshui: ${L('failed to load modification list', '加载修改列表失败')}: ${remote.error.message}`)
      return
    }
    const value = remote.value
    const change = value.changes.find(item => item.path === path && item.accepted !== true)
    if (change === undefined) {
      void vscode.window.showInformationMessage(L(`No unaccepted modification for ${path}.`, `没有未接受的修改：${path}`))
      return
    }
    const texts = buildFileDiffTexts(change)
    if (texts.original === '' && texts.modified === '' && (change.hunks ?? []).length === 0) {
      void vscode.window.showWarningMessage(L('No textual diff is available for this file.', '此文件没有可显示的文本差异。'))
      return
    }
    const state: ReviewState = {
      id: crypto.randomUUID(),
      kind: 'file',
      port,
      sessionId,
      listId: value.listId,
      path,
      original: texts.original,
      modified: texts.modified,
      language: await detectLanguage(change.absolutePath),
      // Deleted files: the right side is empty, so anchor on the old side.
      anchors: change.status === 'deleted'
        ? hunkAnchors(change.hunks ?? [], 'orig')
        : hunkAnchors(change.hunks ?? [], 'mod'),
    }
    this.states.set(state.id, state)
    await this.openDiff(state, `${path} · ${L('baseline → current', '基线 → 当前')}`)
    await this.applyDiffLanguage(state)
  }

  /** Open the native diff for one tool modification (write/edit patch). */
  async showModification(port: number, sessionId: string, path: string, modificationId: string): Promise<void> {
    const remote = await rollbackSessionChanges(port, sessionId)
    if (!remote.ok) {
      void vscode.window.showErrorMessage(`dshui: ${L('failed to load modification list', '加载修改列表失败')}: ${remote.error.message}`)
      return
    }
    const value = remote.value
    const mod = value.modifications.find(item => item.modificationId === modificationId && item.path === path && item.accepted !== true)
    if (mod === undefined) {
      void vscode.window.showInformationMessage(L(`No unaccepted modification ${modificationId}.`, `没有未接受的修改：${modificationId}`))
      return
    }
    const state: ReviewState = {
      id: crypto.randomUUID(),
      kind: 'modification',
      port,
      sessionId,
      listId: value.listId,
      path,
      modificationId,
      original: joinHunkText(mod.hunks, 'old'),
      modified: joinHunkText(mod.hunks, 'new'),
      // The modification diff shows the patch itself, so anchors are positions
      // inside the joined patch document, not file line numbers.
      anchors: patchDocAnchors(mod.hunks),
    }
    this.states.set(state.id, state)
    await this.openDiff(state, `${path} · ${mod.toolName} t${mod.turn}/s${mod.step}`)
  }

  private uriFor(state: ReviewState, side: 'orig' | 'mod'): vscode.Uri {
    return vscode.Uri.parse(`${ROLLBACK_SCHEME}:/${encodeURIComponent(state.id)}?side=${side}`)
  }

  private async openDiff(state: ReviewState, title: string): Promise<void> {
    await vscode.commands.executeCommand(
      'vscode.diff',
      this.uriFor(state, 'orig'),
      this.uriFor(state, 'mod'),
      title,
      { preview: true, preserveFocus: false },
    )
  }

  /**
   * Give both virtual diff sides the real file's language so the diff renders
   * with syntax highlighting (best effort; missing files stay plaintext).
   */
  private async applyDiffLanguage(state: ReviewState): Promise<void> {
    if (state.language === undefined) return
    for (const side of ['orig', 'mod'] as const) {
      try {
        const uri = this.uriFor(state, side)
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.languages.setTextDocumentLanguage(doc, state.language)
      } catch {
        // best effort — plaintext fallback is fine
      }
    }
  }

  private findReviewFromActiveEditor(): ReviewState | undefined {
    const editors = [vscode.window.activeTextEditor, ...vscode.window.visibleTextEditors]
    for (const editor of editors) {
      if (editor === undefined) continue
      const id = parseReviewId(editor.document.uri)
      if (id === undefined) continue
      const state = this.states.get(id)
      if (state !== undefined) return state
    }
    return undefined
  }

  /**
   * Resolve the review state for accept/undo. CodeLens buttons pass their
   * state id explicitly; context-menu / command-palette invocations fall back
   * to scanning the active/visible editors for a `dshui-rollback` document.
   */
  private async handleReviewCommand(action: 'accept' | 'undo', stateId?: string): Promise<void> {
    const state = (stateId !== undefined ? this.states.get(stateId) : undefined)
      ?? this.findReviewFromActiveEditor()
    if (state === undefined) {
      void vscode.window.showWarningMessage(L('No rollback diff is active.', '当前没有可用的回滚差异视图。'))
      return
    }
    if (state.kind === 'modification') {
      if (action === 'accept') await this.acceptModification(state)
      else await this.undoModification(state)
    } else {
      if (action === 'accept') await this.acceptFile(state)
      else await this.undoFile(state)
    }
  }

  private async acceptFile(state: ReviewState): Promise<void> {
    const result = await rollbackCall<unknown>(state.port, 'rollback/acceptFile', { request: { sessionId: state.sessionId, path: state.path, listId: state.listId } })
    this.finishMutation(result, 'acceptFile')
  }

  private async undoFile(state: ReviewState): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
      L(`dshui: Undo changes for ${state.path}?`, `dshui: 撤销文件 ${state.path} 的修改？`),
      { modal: true },
      L('Undo', '撤销'),
    )
    if (choice !== L('Undo', '撤销')) return
    const result = await rollbackCall<unknown>(state.port, 'rollback/undoFile', { request: { sessionId: state.sessionId, path: state.path, listId: state.listId } })
    this.finishMutation(result, 'undoFile')
  }

  private async acceptModification(state: ReviewState): Promise<void> {
    if (state.modificationId === undefined) return
    const result = await rollbackCall<unknown>(state.port, 'rollback/acceptModification', { request: { sessionId: state.sessionId, modificationId: state.modificationId, path: state.path, listId: state.listId } })
    this.finishMutation(result, 'acceptModification')
  }

  private async undoModification(state: ReviewState): Promise<void> {
    if (state.modificationId === undefined) return
    const choice = await vscode.window.showWarningMessage(
      L('dshui: Undo this modification?', 'dshui: 撤销此修改？'),
      { modal: true },
      L('Undo', '撤销'),
    )
    if (choice !== L('Undo', '撤销')) return
    const result = await rollbackCall<unknown>(state.port, 'rollback/undoModification', { request: { sessionId: state.sessionId, modificationId: state.modificationId, listId: state.listId } })
    this.finishMutation(result, 'undoModification')
  }

  private finishMutation(result: RpcResult<unknown>, action: string): void {
    if (!result.ok) {
      void vscode.window.showErrorMessage(`dshui: ${action} failed: ${result.error.message}`)
      return
    }
    this.onDidChange?.()
    void vscode.window.setStatusBarMessage(L('Rollback list updated.', '修改列表已更新。'), 3000)
    // The diff is now stale; close the active diff editor. The user can
    // reopen it from the refreshed sidebar list.
    void vscode.commands.executeCommand('workbench.action.closeActiveEditor')
  }
}
