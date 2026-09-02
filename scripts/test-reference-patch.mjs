// Dev-only: behavioral smoke test for the injected composer-reference intake
// script (dshui-host-ensure-workspace REFERENCE_PATCH). Runs the exact bytes
// the browser will receive inside a minimal fake DOM and asserts the
// queue/drain/insert/ready-handshake behavior for both the legacy `<textarea>`
// composer and the Lexical `contenteditable` composer the extension ships with.
import * as fs from 'node:fs'
import * as vm from 'node:vm'

const script = fs.readFileSync('/tmp/refpatch.js', 'utf8')

function makeTextarea(initial = '') {
  let value = initial
  const ta = {
    tagName: 'TEXTAREA',
    value,
    disabled: false,
    readOnly: false,
    focused: false,
    selectionStart: 0,
    selectionEnd: 0,
    events: [],
    focus() { this.focused = true },
    setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e },
    dispatchEvent(ev) { this.events.push(ev.type) },
  }
  Object.defineProperty(ta, 'value', {
    get() { return value },
    set(v) { value = v },
    configurable: true,
  })
  return ta
}

function makeContenteditable(initial = '') {
  let text = initial
  const el = {
    tagName: 'DIV',
    isContentEditable: true,
    disabled: false,
    readOnly: false,
    focused: false,
    events: [],
    focus() { this.focused = true },
    // Simulate the SPA's PASTE_COMMAND: a synthetic paste with a text/plain
    // payload appends it (the script moves the caret to the end first).
    dispatchEvent(ev) {
      this.events.push(ev.type)
      if (ev.type === 'paste' && ev.clipboardData && ev.clipboardData.getData) {
        const payload = ev.clipboardData.getData('text/plain')
        if (typeof payload === 'string') text += payload
      }
    },
  }
  Object.defineProperty(el, 'textContent', {
    get() { return text },
    set(v) { text = v },
    configurable: true,
  })
  return el
}

function runIntake({ surface = null } = {}) {
  const messages = []
  const windowListeners = {}
  let currentSurface = surface
  const card = {
    querySelector: (sel) => {
      if (sel === '[data-composer-input]') {
        return currentSurface !== null && currentSurface.tagName !== 'TEXTAREA' ? currentSurface : null
      }
      if (sel === 'textarea') {
        return currentSurface !== null && currentSurface.tagName === 'TEXTAREA' ? currentSurface : null
      }
      return null
    },
  }
  const documentStub = { querySelector: (sel) => (sel === '[data-composer-card]' ? card : null) }
  const parent = { postMessage: (m, origin) => messages.push({ m, origin }) }
  const fakeWin = {
    window: null, // self-reference set below
    parent,
    document: documentStub,
    HTMLTextAreaElement: { prototype: {} },
    Event: class { constructor(type) { this.type = type } },
    ClipboardEvent: class {
      constructor(type, opts = {}) {
        this.type = type
        this.clipboardData = opts.clipboardData ?? null
        this.bubbles = opts.bubbles ?? false
        this.cancelable = opts.cancelable ?? false
      }
    },
    DataTransfer: class {
      constructor() { this.store = {} }
      setData(type, value) { this.store[type] = String(value) }
      getData(type) { return this.store[type] ?? '' }
    },
    addEventListener: (type, fn) => { windowListeners[type] = fn },
    getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
    setTimeout,
  }
  documentStub.createRange = () => ({ selectNodeContents() {}, collapse() {} })
  documentStub.execCommand = (cmd, _ui, value) => {
    if (cmd === 'insertText' && currentSurface !== null && currentSurface.tagName !== 'TEXTAREA') {
      currentSurface.textContent += value
      return true
    }
    return false
  }
  fakeWin.window = fakeWin
  const valueSetter = function (v) { this.value = v }
  Object.defineProperty(fakeWin.HTMLTextAreaElement.prototype, 'value', {
    get() { return this.value },
    set: valueSetter,
    configurable: true,
  })
  vm.runInNewContext(script, fakeWin)
  const send = (data, source) => {
    const handler = windowListeners.message
    if (!handler) throw new Error('message listener not registered')
    handler({ data, source: source ?? fakeWin.parent })
  }
  return {
    send, messages, surface,
    mount: (s) => { currentSurface = s },
    current: () => currentSurface,
  }
}

// 1. ready handshake fires at load
{
  const { messages } = runIntake()
  const ready = messages.filter(({ m }) => m && m.type === 'dshui:ready')
  if (ready.length !== 1) throw new Error(`expected 1 ready handshake, got ${ready.length}`)
  console.log('ok: ready handshake fired at load')
}

// 2. insert into a writable textarea with newline separation + input event
{
  const ta = makeTextarea('hello')
  const { send, surface } = runIntake({ surface: ta })
  send({ type: 'dshui:reference', text: '文件引用：`a.ts`' })
  if (surface.value !== 'hello\n文件引用：`a.ts`') throw new Error(`bad append: ${JSON.stringify(surface.value)}`)
  if (!surface.events.includes('input')) throw new Error('input event not dispatched')
  if (!surface.focused) throw new Error('textarea not focused')
  if (surface.selectionEnd !== surface.value.length) throw new Error('caret not at end')
  console.log('ok: textarea appended with newline separation, input event + focus + caret')
}

// 3. insert into a writable contenteditable (Lexical) composer via paste
{
  const ce = makeContenteditable('hello')
  const { send, surface } = runIntake({ surface: ce })
  send({ type: 'dshui:reference', text: '文件引用：`a.ts`' })
  if (surface.textContent !== 'hello\n文件引用：`a.ts`') throw new Error(`bad ce insert: ${JSON.stringify(surface.textContent)}`)
  if (!surface.events.includes('paste')) throw new Error('paste event not dispatched to contenteditable')
  if (!surface.focused) throw new Error('contenteditable not focused')
  console.log('ok: contenteditable appended through synthetic paste with newline separation')
}

// 4. empty contenteditable receives the reference without a leading newline
{
  const ce = makeContenteditable('')
  const { send, surface } = runIntake({ surface: ce })
  send({ type: 'dshui:reference', text: 'REF' })
  if (surface.textContent !== 'REF') throw new Error(`empty ce got a leading sep: ${JSON.stringify(surface.textContent)}`)
  console.log('ok: empty contenteditable receives reference with no leading separator')
}

// 5. queued while composer absent, drained once it mounts (same sandbox)
{
  const ce = makeContenteditable('')
  const intake = runIntake({ surface: null })
  intake.send({ type: 'dshui:reference', text: 'REF-1' })
  // composer still absent: nothing applied, nothing lost
  if (ce.textContent !== '') throw new Error('reference leaked before composer mounted')
  intake.mount(ce) // the composer appears
  intake.send({ type: 'dshui:reference', text: 'REF-2' })
  if (ce.textContent !== 'REF-1\nREF-2') throw new Error(`queued-then-mounted mismatch: ${JSON.stringify(ce.textContent)}`)
  console.log('ok: queued while composer absent, drained after mount')
}

// 6. readOnly composer defers until writable
{
  const ce = makeContenteditable('busy')
  ce.isContentEditable = false
  const { send } = runIntake({ surface: ce })
  send({ type: 'dshui:reference', text: 'REF-X' })
  // still readOnly after drain attempt: value untouched
  if (ce.textContent !== 'busy') throw new Error('readOnly composer was written')
  ce.isContentEditable = true
  send({ type: 'dshui:reference', text: 'REF-Y' })
  if (ce.textContent !== 'busy\nREF-X\nREF-Y') throw new Error(`deferred write bad: ${JSON.stringify(ce.textContent)}`)
  console.log('ok: readOnly composer defers and drains when writable')
}

// 7. ignores foreign messages / wrong source
{
  const ce = makeContenteditable('')
  const { send } = runIntake({ surface: ce })
  send({ type: 'other', text: 'nope' }, 'parent')
  send({ type: 'dshui:reference', text: 'ok' }, 'someone-else')
  send({ type: 'dshui:reference', text: 42 }, 'parent')
  if (ce.textContent !== '') throw new Error(`foreign message leaked: ${JSON.stringify(ce.textContent)}`)
  console.log('ok: foreign types and sources ignored')
}

console.log('\nALL REFERENCE-PATCH BEHAVIOR CHECKS PASSED')
