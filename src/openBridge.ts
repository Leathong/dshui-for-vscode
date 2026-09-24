/**
 * 本机打开桥：把 dsh 服务器的"打开文件"请求转交给 VS Code API。
 *
 * dsh 服务器（独立进程）无法直接调用 VS Code API。扩展在 127.0.0.1 的
 * 随机端口起一个极小的 HTTP 服务，把地址经 `DSHUI_OPEN_ENDPOINT` 环境变量
 * 传给服务器；api-proxy 的打开补丁收到请求后 GET 到这里，由本桥用
 * `showTextDocument` / `openFolder` 在**当前** VS Code 打开。
 * 相比 `open vscode://file/...`（会触发 macOS 外部协议确认弹窗），此路径
 * 完全走 VS Code API，无弹窗、无 OS 中转。
 *
 * 非文本文件（图片、PDF、压缩包、二进制等）会先被识别出来，改走 `vscode.open`
 * ——VS Code 据此选择自己内置的编辑器（图片预览、二进制查看器），而不是让
 * `showTextDocument` 抛 “File seems to be binary and cannot be opened as text”。
 *
 * 为支持 dsh-rollback-plugin 的“打开并跳到修改行”，请求可额外携带 1-based
 * 的 `line`/`column`/`endLine`/`endColumn`；非法值会被忽略而不是让打开失败。
 * 路径还可能带行号后缀（dsh 网页把 markdown 链接目标原样转发过来），两种写法
 * 都支持：GitHub 风格 `src/a.ts#L10`、`src/a.ts#L10-L20`，以及 VS Code / 智能体
 * 风格 `src/a.ts:10`、`src/a.ts:10-20`（含 en dash `–`）。后缀会被剥离后再访问
 * 文件系统，其行号作为选区，显式 `line` 参数优先。
 * 每个桥实例生成一次性 token（`DSHUI_OPEN_TOKEN`），校验不通过返回 403，
 * 防止本机任意进程触发打开。
 */
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { logger } from './logger'

function positiveInteger(value: string | null): number | undefined {
  if (value === null || value === '') return undefined
  if (!/^[1-9][0-9]*$/.test(value)) return undefined
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) return undefined
  return parsed
}

/** 一条链接目标里的行号引用：剥离后缀后的路径加上 1-based 行区间。 */
interface LineTarget {
  path: string
  line: number
  endLine?: number
}

/**
 * Parse a GitHub-style line fragment off a path string: `#L10`, `#L10-L20`
 * or `#L10-20`. The dsh web UI forwards markdown link destinations verbatim,
 * so such anchors reach the bridge inside the path; the bridge must strip
 * them before touching the filesystem and honor the 1-based line range.
 * Any other trailing fragment (a `#` inside a real file name, `#L0`, a
 * non-numeric anchor) leaves the path untouched.
 */
function parseLineFragment(raw: string): LineTarget | null {
  const hash = raw.lastIndexOf('#')
  if (hash === -1) return null
  const match = /^L([1-9][0-9]*)(?:-L?([1-9][0-9]*))?$/.exec(raw.slice(hash + 1))
  if (match === null) return null
  const line = Number(match[1])
  const endLine = match[2] === undefined ? undefined : Number(match[2])
  if (!Number.isSafeInteger(line) || (endLine !== undefined && !Number.isSafeInteger(endLine))) return null
  return { path: raw.slice(0, hash), line, endLine }
}

/**
 * Parse a trailing `:line` / `:line-end` reference off a path string — the
 * form the dsh agent is told to write for file links (`src/a.ts:94`,
 * `src/a.ts:94-120`, `src/a.ts:94–120`). The destination reaches the bridge
 * verbatim, so `statSync` would otherwise fail with ENOENT on the suffixed
 * string. The suffix must be digits up to the end, so a Windows drive letter
 * (`C:\...`) and any other colon never match.
 */
function parseLineSuffix(raw: string): LineTarget | null {
  const match = /:([1-9][0-9]*)(?:[-–]([1-9][0-9]*))?$/.exec(raw)
  if (match === null || match.index === 0) return null
  const line = Number(match[1])
  const endLine = match[2] === undefined ? undefined : Number(match[2])
  if (!Number.isSafeInteger(line) || (endLine !== undefined && !Number.isSafeInteger(endLine))) return null
  return { path: raw.slice(0, match.index), line, endLine }
}

/** Whether one path exists on disk as a file; anything else means "not this candidate". */
function isExistingFile(target: string): boolean {
  try {
    return fs.statSync(target).isFile()
  } catch {
    // Missing or unreadable: the caller falls back to the literal path and
    // reports its own stat error, so this probe stays silent.
    return false
  }
}

/**
 * Extensions whose files VS Code never renders as text: its built-in image
 * preview covers the images, every other family reaches the binary viewer (or
 * a custom editor the user installed for it). Answering from the name keeps the
 * common case free of a disk read; the content sniff below decides the rest.
 * `.svg` is deliberately absent — VS Code opens it as the XML text it is.
 */
const NON_TEXT_EXTENSIONS = new Set([
  // images
  '.png', '.jpg', '.jpeg', '.jfif', '.gif', '.webp', '.bmp', '.ico', '.icns', '.avif', '.heic', '.tif', '.tiff', '.psd',
  // documents, archives and packaged apps
  '.pdf', '.zip', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.jar', '.whl', '.war',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.pages', '.numbers', '.key',
  // audio and video
  '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.mp4', '.m4v', '.mov', '.avi', '.mkv', '.webm',
  // executables and machine code
  '.exe', '.dll', '.so', '.dylib', '.node', '.bin', '.wasm', '.class', '.pyc', '.o', '.a', '.lib',
  // databases and fonts
  '.db', '.sqlite', '.sqlite3', '.realm', '.ttf', '.otf', '.woff', '.woff2', '.eot',
])

/** Leading bytes inspected when the extension alone cannot decide. */
const SNIFF_BYTES = 512

/** UTF-16 byte-order marks, which the text model never inspects for binary content. */
function hasUtf16Bom(sample: Buffer): boolean {
  if (sample.length < 2) return false
  return (sample[0] === 0xff && sample[1] === 0xfe) || (sample[0] === 0xfe && sample[1] === 0xff)
}

/**
 * Whether the leading bytes look like binary content — VS Code's own rule,
 * mirrored so a file this probe calls text is also one the text editor accepts:
 * a NUL byte makes the file binary, unless every other byte is zero, which is
 * BOM-less UTF-16 that the text model detects by itself. The scan stops as soon
 * as neither UTF-16 shape can hold, exactly like the original.
 */
function looksBinary(sample: Buffer): boolean {
  const limit = Math.min(sample.length, SNIFF_BYTES)
  let sawNul = false
  let couldBeUtf16Le = true
  let couldBeUtf16Be = true
  for (let index = 0; index < limit; index++) {
    const isNul = sample[index] === 0
    const isOdd = index % 2 === 1
    if (isNul) sawNul = true
    if (couldBeUtf16Le && ((isOdd && !isNul) || (!isOdd && isNul))) couldBeUtf16Le = false
    if (couldBeUtf16Be && ((isOdd && isNul) || (!isOdd && !isNul))) couldBeUtf16Be = false
    if (isNul && !couldBeUtf16Le && !couldBeUtf16Be) break
  }
  return sawNul && !couldBeUtf16Le && !couldBeUtf16Be
}

/**
 * Whether the text editor would refuse one file.
 *
 * Known non-text families answer from their extension without a disk read;
 * everything else is decided by the same leading-byte rule VS Code applies, so
 * text here means text there too. A legacy encoding such as GBK therefore stays
 * text (it carries no NUL), and an unreadable file is left to the open itself,
 * which reports the real error instead of a guess.
 */
function isNonTextFile(absPath: string): boolean {
  if (NON_TEXT_EXTENSIONS.has(path.extname(absPath).toLowerCase())) return true
  let sample: Buffer
  try {
    const handle = fs.openSync(absPath, 'r')
    try {
      const buffer = Buffer.alloc(SNIFF_BYTES)
      sample = buffer.subarray(0, fs.readSync(handle, buffer, 0, SNIFF_BYTES, 0))
    } finally {
      fs.closeSync(handle)
    }
  } catch {
    return false
  }
  if (sample.length === 0 || hasUtf16Bom(sample)) return false
  return looksBinary(sample)
}

export class OpenBridge {
  private server: http.Server | null = null
  private port = 0

  /** 每次启动生成的随机 token；宿主进程通过 `DSHUI_OPEN_TOKEN` 注入。 */
  readonly token = crypto.randomUUID()

  /** 启动监听（幂等），resolve 后 `endpoint` 才可用。 */
  start(): Promise<void> {
    if (this.server !== null) return Promise.resolve()
    this.server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        if (req.method !== 'GET') {
          res.writeHead(405, { 'content-type': 'text/plain' })
          res.end('method not allowed')
          return
        }
        if (url.searchParams.get('token') !== this.token) {
          res.writeHead(403, { 'content-type': 'text/plain' })
          res.end('forbidden')
          return
        }
        const target = url.searchParams.get('path')
        if (target === null || target === '') {
          res.writeHead(400, { 'content-type': 'text/plain' })
          res.end('missing path')
          return
        }
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('ok')
        const line = positiveInteger(url.searchParams.get('line'))
        const column = positiveInteger(url.searchParams.get('column'))
        const endLine = positiveInteger(url.searchParams.get('endLine'))
        const endColumn = positiveInteger(url.searchParams.get('endColumn'))
        void this.open(target, { line, column, endLine, endColumn })
      } catch (error) {
        logger.error('[dshui] open bridge request failed:', error)
        try {
          if (!res.headersSent) {
            res.writeHead(400, { 'content-type': 'text/plain' })
            res.end('bad request')
          }
        } catch {
          // The response may already be gone; the request is untrusted input.
        }
      }
    })
    return new Promise((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '127.0.0.1', () => {
        this.server!.off('error', reject)
        const address = this.server!.address()
        if (address !== null && typeof address === 'object') this.port = address.port
        resolve()
      })
    })
  }

  /** dsh 服务器要用的端点（仅当已启动时有效）。 */
  get endpoint(): string {
    return `http://127.0.0.1:${this.port}/open`
  }

  get running(): boolean {
    return this.server !== null
  }

  private async open(
    rawPath: string,
    selection: { line?: number; column?: number; endLine?: number; endColumn?: number },
  ): Promise<void> {
    try {
      // A markdown destination may carry a line reference: a GitHub-style
      // anchor (`#L10`) or a trailing `:10`. Strip it for the filesystem; its
      // line range becomes the selection only when the caller sent no
      // explicit line params (those win).
      const fragment = parseLineFragment(rawPath)
      // A colon suffix is a line reference only when the path without it is
      // an existing file — so a file whose name really ends in `:12` still
      // opens under its own name, and a directory link is never truncated.
      const suffix = fragment === null ? parseLineSuffix(rawPath) : null
      const target = fragment ?? (suffix !== null && isExistingFile(suffix.path) ? suffix : null)
      const targetPath = target?.path ?? rawPath
      const uri = vscode.Uri.file(targetPath)
      const stat = fs.statSync(targetPath)
      if (stat.isDirectory()) {
        // 目录：在新窗口以工作区打开，避免破坏当前工作区。line 参数对目录无意义。
        await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true })
        return
      }
      if (isNonTextFile(targetPath)) {
        // 非文本：文本编辑器会直接报 “File seems to be binary and cannot be
        // opened as text”，改交给 vscode.open，由 VS Code 选内置编辑器
        // （图片走图片预览，其他二进制走二进制查看器）。
        await this.openNonTextFile(uri)
        return
      }
      const options: vscode.TextDocumentShowOptions = { preview: true }
      const line = selection.line ?? target?.line
      if (line !== undefined) {
        const startLine = line - 1
        const startColumn = Math.max(0, (selection.column ?? 1) - 1)
        const endLine = selection.endLine ?? (selection.line === undefined ? target?.endLine : undefined) ?? line
        const endLineValue = Math.max(startLine, endLine - 1)
        const endColumnValue = Math.max(startColumn, (selection.endColumn ?? 1) - 1)
        options.selection = new vscode.Selection(startLine, startColumn, endLineValue, endColumnValue)
      }
      try {
        await vscode.window.showTextDocument(uri, options)
      } catch (error) {
        // 探针判为文本、文本模型仍然拒绝（探针看不到的编码或体积问题）：
        // 再走一次 workbench 打开，让用户看到 VS Code 自己的提示而不是只剩日志。
        logger.info('[dshui] open bridge: retrying outside the text editor:', targetPath, error)
        await vscode.commands.executeCommand('vscode.open', uri)
      }
    } catch (error) {
      logger.error('[dshui] open bridge failed to open:', rawPath, error)
    }
  }

  /**
   * Open one non-text path the way a click in the Explorer does: `vscode.open`
   * resolves the editor per resource (built-in image preview, binary viewer, or
   * a custom editor the user associated), while `showTextDocument` goes through
   * the extension-host text path and rejects the very same bytes. Should even
   * that fail — a binary with no editor at all — the OS default application is
   * the last resort, so a screenshot still opens somewhere.
   */
  private async openNonTextFile(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.commands.executeCommand('vscode.open', uri)
    } catch (error) {
      logger.warn('[dshui] open bridge: vscode.open failed, falling back to the OS default app:', uri.fsPath, error)
      if (!(await vscode.env.openExternal(uri))) throw error
    }
  }

  dispose(): void {
    this.server?.close()
    this.server = null
  }
}
