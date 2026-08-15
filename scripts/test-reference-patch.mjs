// Dev-only: behavioral smoke test for the injected composer-reference intake
// script (dshui-host-ensure-workspace REFERENCE_PATCH). Runs the exact bytes
// the browser will receive inside a minimal fake DOM and asserts the
// queue/drain/insert/ready-handshake behavior.
import * as fs from 'node:fs'
import * as vm from 'node:vm'

const script = fs.readFileSync('/tmp/refpatch.js', 'utf8')

function makeTextarea(initial = '') {
  let value = initial
  const ta = {
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

function runIntake({ textarea = null } = {}) {
  const messages = []
  const windowListeners = {}
  let currentTextarea = textarea
  const card = { querySelector: (sel) => (sel === 'textarea' ? currentTextarea : null) }
  const documentStub = { querySelector: (sel) => (sel === '[data-composer-card]' ? card : null) }
  const parent = { postMessage: (m, origin) => messages.push({ m, origin }) }
  const fakeWin = {
    window: null, // self-reference set below
    parent,
    document: documentStub,
    HTMLTextAreaElement: { prototype: {} },
    Event: class { constructor(type) { this.type = type } },
    addEventListener: (type, fn) => { windowListeners[type] = fn },
    setTimeout,
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
  return { send, messages, textarea, mount: (ta) => { currentTextarea = ta } }
}

// 1. ready handshake fires at load
{
  const { messages } = runIntake()
  const ready = messages.filter(({ m }) => m && m.type === 'dshui:ready')
  if (ready.length !== 1) throw new Error(`expected 1 ready handshake, got ${ready.length}`)
  console.log('ok: ready handshake fired at load')
}

// 2. insert into a writable composer with newline separation + input event
{
  const ta = makeTextarea('hello')
  const { send, textarea } = runIntake({ textarea: ta })
  send({ type: 'dshui:reference', text: '文件引用：`a.ts`' })
  if (textarea.value !== 'hello\n文件引用：`a.ts`') throw new Error(`bad append: ${JSON.stringify(textarea.value)}`)
  if (!textarea.events.includes('input')) throw new Error('input event not dispatched')
  if (!textarea.focused) throw new Error('textarea not focused')
  if (textarea.selectionEnd !== textarea.value.length) throw new Error('caret not at end')
  console.log('ok: appended with newline separation, input event + focus + caret')
}

// 3. queued while composer absent, drained once it mounts (same sandbox)
{
  const ta = makeTextarea('')
  const intake = runIntake({ textarea: null })
  intake.send({ type: 'dshui:reference', text: 'REF-1' })
  // composer still absent: nothing applied, nothing lost
  if (ta.value !== '') throw new Error('reference leaked before composer mounted')
  intake.mount(ta) // the composer appears
  intake.send({ type: 'dshui:reference', text: 'REF-2' })
  if (ta.value !== 'REF-1\nREF-2') throw new Error(`queued-then-mounted mismatch: ${JSON.stringify(ta.value)}`)
  console.log('ok: queued while composer absent, drained after mount')
}

// 4. readOnly composer defers until writable
{
  const ta = makeTextarea('busy')
  ta.readOnly = true
  const { send } = runIntake({ textarea: ta })
  send({ type: 'dshui:reference', text: 'REF-X' })
  // still readOnly after drain attempt: value untouched
  if (ta.value !== 'busy') throw new Error('readOnly composer was written')
  ta.readOnly = false
  send({ type: 'dshui:reference', text: 'REF-Y' })
  if (ta.value !== 'busy\nREF-X\nREF-Y') throw new Error(`deferred write bad: ${JSON.stringify(ta.value)}`)
  console.log('ok: readOnly composer defers and drains when writable')
}

// 5. ignores foreign messages / wrong source
{
  const ta = makeTextarea('')
  const { send } = runIntake({ textarea: ta })
  send({ type: 'other', text: 'nope' }, 'parent')
  send({ type: 'dshui:reference', text: 'ok' }, 'someone-else')
  send({ type: 'dshui:reference', text: 42 }, 'parent')
  if (ta.value !== '') throw new Error(`foreign message leaked: ${JSON.stringify(ta.value)}`)
  console.log('ok: foreign types and sources ignored')
}

console.log('\nALL REFERENCE-PATCH BEHAVIOR CHECKS PASSED')
