/**
 * Builders for the dsh composer "reference" payloads, driven by the VS Code
 * context-menu commands (`dshui.referenceFile` / `dshui.referenceFolder` /
 * `dshui.referenceSelection`).
 *
 * The payload travels extension → webview shell → dsh SPA iframe, where the
 * dshui host plugin's injected intake script inserts `text` into the composer
 * draft. Pure module: no vscode imports, so the formatting rules stay
 * unit-testable and the extension.ts wiring stays thin.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

export type ReferenceKind = 'file' | 'folder' | 'snippet'

/** The message the extension posts to the webview shell (forwarded to the SPA iframe). */
export interface ReferencePayload {
  type: 'dshui:reference'
  kind: ReferenceKind
  /** Display path (workspace-relative with `/` separators when inside the workspace). */
  path: string
  /** 1-based start line; snippet references only. */
  line?: number
  /** 1-based end line; snippet references only. */
  endLine?: number
  /** The text inserted into the composer draft. */
  text: string
}

/** Cap on embedded snippet characters; longer selections are truncated with a note. */
const SNIPPET_CHAR_CAP = 20_000

/**
 * The display spelling of a path for the composer: workspace-relative with
 * `/` separators when the file sits inside the workspace, absolute otherwise.
 * Both inputs are canonicalized first (the workspace root already is; the
 * file is resolved defensively so a symlinked file inside the workspace does
 * not render as an external `..` path).
 * @param filePath - absolute filesystem path of the referenced file.
 * @param workspacePath - absolute workspace root (the dsh cwd).
 * @returns the display path.
 */
export function relativeDisplayPath(filePath: string, workspacePath: string): string {
  let real = filePath
  try {
    real = fs.realpathSync(filePath)
  } catch {
    // Unreadable/vanished file: keep the caller's spelling.
  }
  const rel = path.relative(workspacePath, real)
  const inside = rel !== ''
    && rel !== '..'
    && !rel.startsWith(`..${path.sep}`)
    && !path.isAbsolute(rel)
  return (inside ? rel : real).split(path.sep).join('/')
}

/**
 * A standard markdown inline link `[label](href)`. The destination is
 * URL-encoded (a raw space is invalid in a CommonMark destination) and
 * destinations containing whitespace or brackets are additionally wrapped in
 * angle brackets. The label escapes `]` so it cannot close the link early.
 */
function markdownLink(label: string, href: string): string {
  const encoded = encodeURI(href)
  const destination = /[\s<>()]/.test(href) ? `<${encoded}>` : encoded
  return `[${label.replaceAll(']', '\\]')}](${destination})`
}

/**
 * Build a path reference for a file **or folder**: the display path as a
 * standard markdown link (`[path](path)`). Folders carry a trailing `/` so
 * reader and agent alike can tell them apart from files at a glance. The
 * agent reads or lists the target itself with its own tools — embedding
 * whole-file content would flood the draft.
 * @param filePath - absolute filesystem path of the referenced file or folder.
 * @param workspacePath - absolute workspace root.
 * @returns the reference payload.
 */
export function buildFileReference(filePath: string, workspacePath: string): ReferencePayload {
  const display = relativeDisplayPath(filePath, workspacePath)
  const folder = isDirectory(filePath)
  const dirMarked = folder && !display.endsWith('/') ? `${display}/` : display
  return {
    type: 'dshui:reference',
    kind: folder ? 'folder' : 'file',
    path: dirMarked,
    text: markdownLink(dirMarked, dirMarked),
  }
}

/** Whether the path names an existing directory (best-effort; false on any failure). */
function isDirectory(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory()
  } catch {
    return false
  }
}

/** Inputs for a snippet reference (all editor-derived, resolved by the caller). */
export interface SnippetReferenceInput {
  /** Absolute filesystem path of the file the selection lives in. */
  filePath: string
  /** Absolute workspace root. */
  workspacePath: string
  /** VS Code language id of the document (e.g. `typescript`); used as the fence language. */
  languageId: string
  /** The selected text. */
  snippet: string
  /** 1-based start line of the selection. */
  startLine: number
  /** 1-based end line of the selection. */
  endLine: number
}

/**
 * Build a code-snippet reference: the display path with a GitHub-style line
 * anchor (`[path#L5-L6](path#L5-L6)`) plus the selected code in a fenced
 * block, so the agent sees the snippet without a read call while still
 * knowing exactly where it lives. Over-long selections are truncated with a
 * note pointing at the full file.
 * @param input - editor-derived reference inputs.
 * @returns the reference payload.
 */
export function buildSnippetReference(input: SnippetReferenceInput): ReferencePayload {
  const display = relativeDisplayPath(input.filePath, input.workspacePath)
  let body = input.snippet
  let note = ''
  if (body.length > SNIPPET_CHAR_CAP) {
    body = body.slice(0, SNIPPET_CHAR_CAP)
    note = `\n\n（选中内容过长，已截断为前 ${SNIPPET_CHAR_CAP} 字符；完整内容请读取 ${display}）`
  }
  const anchor = input.startLine === input.endLine
    ? `#L${input.startLine}`
    : `#L${input.startLine}-L${input.endLine}`
  const target = `${display}${anchor}`
  // A snippet containing triple backticks widens the fence so the block stays closed.
  const fence = body.includes('```') ? '````' : '```'
  const fenceLang = input.languageId === '' || input.languageId === 'plaintext' ? '' : input.languageId
  const text = [
    markdownLink(target, target),
    `${fence}${fenceLang}`,
    body,
    fence,
  ].join('\n') + note
  return {
    type: 'dshui:reference',
    kind: 'snippet',
    path: display,
    line: input.startLine,
    endLine: input.endLine,
    text,
  }
}
