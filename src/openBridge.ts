/**
 * 本机打开桥：把 dsh 服务器的"打开文件"请求转交给 VS Code API。
 *
 * dsh 服务器（独立进程）无法直接调用 VS Code API。扩展在 127.0.0.1 的
 * 随机端口起一个极小的 HTTP 服务，把地址经 `DSHUI_OPEN_ENDPOINT` 环境变量
 * 传给服务器；api-proxy 的打开补丁收到请求后 POST 到这里（GET，带 path 查询
 * 参数），由本桥用 `showTextDocument` / `openFolder` 在**当前** VS Code 打开。
 * 相比 `open vscode://file/...`（会触发 macOS 外部协议确认弹窗），此路径
 * 完全走 VS Code API，无弹窗、无 OS 中转。
 */
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as vscode from 'vscode'

export class OpenBridge {
  private server: http.Server | null = null
  private port = 0

  /** 启动监听（幂等），resolve 后 `endpoint` 才可用。 */
  start(): Promise<void> {
    if (this.server !== null) return Promise.resolve()
    this.server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const target = url.searchParams.get('path')
        if (target !== null && target !== '') void this.open(target)
      } catch (error) {
        console.error('[dshui] open bridge request failed:', error)
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

  private async open(rawPath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(rawPath)
      const stat = fs.statSync(rawPath)
      if (stat.isDirectory()) {
        // 目录：在新窗口以工作区打开，避免破坏当前工作区。
        await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true })
      } else {
        await vscode.window.showTextDocument(uri, { preview: true })
      }
    } catch (error) {
      console.error('[dshui] open bridge failed to open:', rawPath, error)
    }
  }

  dispose(): void {
    this.server?.close()
    this.server = null
  }
}
