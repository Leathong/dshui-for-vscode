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
 * 为支持 dsh-rollback-plugin 的“打开并跳到修改行”，请求可额外携带 1-based
 * 的 `line`/`column`/`endLine`/`endColumn`；非法值会被忽略而不是让打开失败。
 * 每个桥实例生成一次性 token（`DSHUI_OPEN_TOKEN`），校验不通过返回 403，
 * 防止本机任意进程触发打开。
 */
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as vscode from 'vscode'

function positiveInteger(value: string | null): number | undefined {
  if (value === null || value === '') return undefined
  if (!/^[1-9][0-9]*$/.test(value)) return undefined
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) return undefined
  return parsed
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
        console.error('[dshui] open bridge request failed:', error)
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
      const uri = vscode.Uri.file(rawPath)
      const stat = fs.statSync(rawPath)
      if (stat.isDirectory()) {
        // 目录：在新窗口以工作区打开，避免破坏当前工作区。line 参数对目录无意义。
        await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true })
        return
      }
      const options: vscode.TextDocumentShowOptions = { preview: true }
      if (selection.line !== undefined) {
        const startLine = selection.line - 1
        const startColumn = Math.max(0, (selection.column ?? 1) - 1)
        const endLineValue = Math.max(startLine, (selection.endLine ?? selection.line) - 1)
        const endColumnValue = Math.max(startColumn, (selection.endColumn ?? 1) - 1)
        options.selection = new vscode.Selection(startLine, startColumn, endLineValue, endColumnValue)
      }
      await vscode.window.showTextDocument(uri, options)
    } catch (error) {
      console.error('[dshui] open bridge failed to open:', rawPath, error)
    }
  }

  dispose(): void {
    this.server?.close()
    this.server = null
  }
}
