/**
 * Per-window loopback origin in front of the shared dsh server.
 *
 * One dsh process must serve every window: `$DSH_HOME` then has a single
 * writer, the IM channels connect once, and no window can hit EADDRINUSE. The
 * browser side, however, must NOT share one origin across windows. An origin
 * owns more than cookies:
 *
 * - one HTTP/1.1 connection pool (six sockets in Electron/Chromium, shared by
 *   every window of the profile) — once the pool is saturated or holds leaked
 *   sockets, page RPCs queue inside the browser forever: the UI keeps
 *   rendering and accepts input, but a send never leaves the process and the
 *   host records nothing;
 * - localStorage / sessionStorage / IndexedDB, so one window's "last session",
 *   drafts, and view state leak into another window's workspace;
 * - page-scoped client singletons of a client stack built around one client
 *   per application instance.
 *
 * This proxy gives the window its own origin (`http://127.0.0.1:<port>/`)
 * while forwarding every request, response stream, and WebSocket upgrade to
 * the shared server, so per-window isolation is structural instead of a set of
 * JavaScript workarounds. It also rewrites the served index to pin the
 * workspace scope: the scope stops depending on a `dshui_workspace` query that
 * any redirect can drop.
 */
import * as http from 'node:http'
import * as net from 'node:net'
import { logger } from './logger'

/** Loopback authority of the shared dsh server this proxy forwards to. */
export interface WindowProxyTarget {
  host: '127.0.0.1'
  port: number
}

export interface WindowProxyOptions {
  /** Current shared-server port, or undefined while it is not bound yet. */
  targetPort: () => number | undefined
  /** Canonical workspace folder of the owning window; '' when none is open. */
  scope: () => string
}

/**
 * The injected scope global as the host plugin emits it:
 * `window.__DSHUI_WORKSPACE__ = (new URLSearchParams(...)) || "<server cwd>"`.
 * The proxy replaces the whole expression, so the page's scope is the window's
 * folder regardless of the URL it was reached through.
 */
const SCOPE_GLOBAL = /window\.__DSHUI_WORKSPACE__ = [^<]*/

/** One per-window origin fronting the shared dsh server. */
export class WindowProxy {
  private server: http.Server | null = null
  private boundPort = 0
  /** Upgraded client sockets, closed on dispose (Node skips them otherwise). */
  private readonly upgraded = new Set<net.Socket>()

  constructor(private readonly options: WindowProxyOptions) {}

  /** The window's own origin; undefined until {@link start} resolved. */
  get origin(): string | undefined {
    return this.server === null ? undefined : `http://127.0.0.1:${this.boundPort}`
  }

  get running(): boolean {
    return this.server !== null
  }

  /** Bind the per-window origin (idempotent). */
  start(): Promise<void> {
    if (this.server !== null) return Promise.resolve()
    this.server = http.createServer((req, res) => { this.forward(req, res) })
    this.server.on('upgrade', (req, socket, head) => { this.forwardUpgrade(req, socket as net.Socket, head) })
    return new Promise((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '127.0.0.1', () => {
        this.server!.off('error', reject)
        const address = this.server!.address()
        if (address !== null && typeof address === 'object') this.boundPort = address.port
        resolve()
      })
    })
  }

  dispose(): void {
    for (const socket of this.upgraded) socket.destroy()
    this.upgraded.clear()
    this.server?.close()
    this.server = null
  }

  /**
   * Headers for one forwarded request: the caller's, with the authority
   * rewritten to the shared server, which keeps its loopback trust checks and
   * picks the same browser-session cookie for every window.
   *
   * Two browser-supplied values must follow that rewrite:
   *
   * - `accept-encoding` is dropped so the upstream answers identity: this proxy
   *   rewrites the HTML index textually, and a compressed body fed through that
   *   rewrite comes out as replacement characters (gzip magic decoded as UTF-8)
   *   — a blank panel. The extra bytes on a loopback hop cost nothing.
   * - `origin` / `referer` name this window's proxy authority, while the
   *   upstream fences every browser request on `Origin === Host`. Only our own
   *   origin is rewritten; a foreign origin is left untouched so the fence
   *   still refuses it.
   */
  private targetHeaders(req: http.IncomingMessage, port: number): http.OutgoingHttpHeaders {
    const headers: http.OutgoingHttpHeaders = { ...req.headers }
    const authority = `127.0.0.1:${port}`
    headers.host = authority
    delete headers['accept-encoding']
    const self = this.origin
    if (self !== undefined) {
      if (headers.origin === self) headers.origin = `http://${authority}`
      if (typeof headers.referer === 'string' && headers.referer.startsWith(`${self}/`)) {
        headers.referer = `http://${authority}/${headers.referer.slice(self.length + 1)}`
      }
    }
    return headers
  }

  /**
   * Whether one response body may be rewritten as text: an HTML index the
   * upstream did not compress. Everything else is forwarded byte for byte.
   */
  private static rewritable(type: string, encoding: string | string[] | undefined): boolean {
    if (!type.includes('text/html')) return false
    return encoding === undefined || encoding === 'identity'
  }

  /** Forward one HTTP request; HTML index responses get their scope pinned. */
  private forward(req: http.IncomingMessage, res: http.ServerResponse): void {
    const port = this.options.targetPort()
    if (port === undefined) {
      res.writeHead(503, { 'content-type': 'text/plain' })
      res.end('dsh server is not running')
      return
    }
    const upstream = http.request({
      host: '127.0.0.1',
      port,
      method: req.method,
      path: req.url,
      headers: this.targetHeaders(req, port),
    }, (response) => {
      const type = response.headers['content-type'] ?? ''
      if (!WindowProxy.rewritable(type, response.headers['content-encoding'])) {
        res.writeHead(response.statusCode ?? 502, response.headers)
        response.pipe(res)
        return
      }
      // The index is small and the rewrite is textual: buffer it instead of
      // trying to patch a streamed body.
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        const headers = { ...response.headers }
        // Content-Length no longer describes the rewritten body.
        delete headers['content-length']
        res.writeHead(response.statusCode ?? 502, headers)
        res.end(this.pinScope(Buffer.concat(chunks).toString('utf8')))
      })
      response.on('error', () => { res.destroy() })
    })
    upstream.on('error', (error) => {
      logger.warn('[dshui] window origin: forwarding failed:', error)
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
      res.end('dsh server unreachable')
    })
    req.pipe(upstream)
  }

  /** Replace the injected scope fallback with this window's folder. */
  private pinScope(html: string): string {
    const scope = this.options.scope()
    if (scope === '') return html
    return html.replace(SCOPE_GLOBAL, `window.__DSHUI_WORKSPACE__ = ${JSON.stringify(scope).replaceAll('<', '\\u003c')}`)
  }

  /**
   * Forward one HTTP upgrade (the Gateway WebSocket mux) by writing the request
   * line and headers to the shared server verbatim, then piping both sockets.
   */
  private forwardUpgrade(req: http.IncomingMessage, socket: net.Socket, head: Buffer): void {
    const port = this.options.targetPort()
    if (port === undefined) {
      socket.destroy()
      return
    }
    const upstream = net.connect(port, '127.0.0.1', () => {
      const headers = this.targetHeaders(req, port)
      const lines = [`${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/1.1`]
      for (const [name, value] of Object.entries(headers)) {
        if (value === undefined) continue
        for (const item of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${String(item)}`)
      }
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
      if (head.length > 0) upstream.write(head)
      socket.pipe(upstream)
      upstream.pipe(socket)
    })
    this.upgraded.add(socket)
    this.upgraded.add(upstream)
    socket.on('close', () => { this.upgraded.delete(socket); upstream.destroy() })
    upstream.on('close', () => { this.upgraded.delete(upstream); socket.destroy() })
    upstream.on('error', () => { socket.destroy() })
    socket.on('error', () => { upstream.destroy() })
  }
}
