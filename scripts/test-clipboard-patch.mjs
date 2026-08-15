// Dev-only: behavioral smoke test for the injected clipboard/keyboard patch
// (dshui-host-ensure-workspace CLIPBOARD_PATCH). Runs the exact bytes the
// browser will receive inside a minimal fake DOM and asserts the copy/paste/
// cut/selectAll/undo/redo interception: the right execCommand runs and the
// event is swallowed so the VS Code workbench never sees the chord.
import * as fs from 'node:fs'
import * as vm from 'node:vm'

const script = fs.readFileSync('/tmp/clipboardpatch.js', 'utf8')

function makeEvent({ key, meta = false, ctrl = false, shift = false }) {
  return {
    key,
    metaKey: meta,
    ctrlKey: ctrl,
    shiftKey: shift,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true },
    stopPropagation() { this.stopped = true },
  }
}

function runPatch({ selection = [0, 3] } = {}) {
  const execCalls = []
  const windowListeners = {}
  const activeElement = {
    tagName: 'TEXTAREA',
    selectionStart: selection[0],
    selectionEnd: selection[1], // a non-empty selection for the copy branch
  }
  const fakeWin = {
    window: null, // self-reference set below
    navigator: {
      clipboard: {
        writeText: () => Promise.resolve(),
        readText: () => Promise.resolve(''),
      },
    },
    document: {
      activeElement,
      execCommand: (cmd) => { execCalls.push(cmd); return true },
      createElement: () => ({ value: '', setAttribute() {}, style: {}, focus() {}, select() {}, remove() {} }),
      body: { appendChild() {}, removeChild() {} },
    },
    HTMLTextAreaElement: { prototype: {} },
    getSelection: () => ({ toString: () => '' }), // no selection by default
    addEventListener: (type, fn) => { windowListeners[type] = fn },
  }
  fakeWin.window = fakeWin
  vm.runInNewContext(script, fakeWin)
  const keydown = (event) => {
    const handler = windowListeners.keydown
    if (!handler) throw new Error('keydown listener not registered')
    handler(event)
    return event
  }
  return { keydown, execCalls }
}

// 1. bare Cmd+Z / Ctrl+Z → native undo, event swallowed
{
  const { keydown, execCalls } = runPatch()
  const ev = keydown(makeEvent({ key: 'z', meta: true }))
  if (execCalls.at(-1) !== 'undo') throw new Error(`cmd+z did not run undo: ${JSON.stringify(execCalls)}`)
  if (!ev.prevented || !ev.stopped) throw new Error('cmd+z was not swallowed')
  console.log('ok: Cmd+Z runs undo and is swallowed')
}

// 2. Shift+Cmd+Z → native redo, event swallowed
{
  const { keydown, execCalls } = runPatch()
  const ev = keydown(makeEvent({ key: 'z', meta: true, shift: true }))
  if (execCalls.at(-1) !== 'redo') throw new Error(`shift+cmd+z did not run redo: ${JSON.stringify(execCalls)}`)
  if (!ev.prevented || !ev.stopped) throw new Error('shift+cmd+z was not swallowed')
  console.log('ok: Shift+Cmd+Z runs redo and is swallowed')
}

// 3. Shift+Ctrl+Z and Ctrl+Y (Windows redo chords) → redo
{
  const { keydown, execCalls } = runPatch()
  keydown(makeEvent({ key: 'z', ctrl: true, shift: true }))
  if (execCalls.at(-1) !== 'redo') throw new Error(`ctrl+shift+z did not run redo: ${JSON.stringify(execCalls)}`)
  keydown(makeEvent({ key: 'y', ctrl: true }))
  if (execCalls.at(-1) !== 'redo') throw new Error(`ctrl+y did not run redo: ${JSON.stringify(execCalls)}`)
  keydown(makeEvent({ key: 'y', meta: true }))
  if (execCalls.at(-1) !== 'redo') throw new Error(`cmd+y did not run redo: ${JSON.stringify(execCalls)}`)
  console.log('ok: Shift+Ctrl+Z, Ctrl+Y and Cmd+Y all run redo')
}

// 4. Cmd+C with a textarea selection → copy; with no selection → untouched
{
  const { keydown, execCalls } = runPatch()
  keydown(makeEvent({ key: 'c', meta: true }))
  if (execCalls.at(-1) !== 'copy') throw new Error(`cmd+c did not run copy: ${JSON.stringify(execCalls)}`)
  const passthrough = runPatch({ selection: [2, 2] }) // caret, no selection
  passthrough.keydown(makeEvent({ key: 'c', meta: true }))
  if (passthrough.execCalls.includes('copy')) throw new Error('cmd+c with no selection ran copy')
  console.log('ok: Cmd+C copies only with a selection')
}

// 5. Cmd+V / Cmd+X / Cmd+A still work (regression)
{
  const { keydown, execCalls } = runPatch()
  keydown(makeEvent({ key: 'v', meta: true }))
  keydown(makeEvent({ key: 'x', meta: true }))
  keydown(makeEvent({ key: 'a', meta: true }))
  const seen = execCalls.slice(-3)
  if (seen[0] !== 'paste' || seen[1] !== 'cut' || seen[2] !== 'selectAll') {
    throw new Error(`paste/cut/selectAll regression: ${JSON.stringify(seen)}`)
  }
  console.log('ok: Cmd+V / Cmd+X / Cmd+A still run paste / cut / selectAll')
}

// 6. Non-editing chords and modifier-less keys pass through untouched
{
  const { keydown, execCalls } = runPatch()
  const s = keydown(makeEvent({ key: 's', meta: true }))
  if (s.prevented || s.stopped) throw new Error('cmd+s was swallowed')
  const plain = keydown(makeEvent({ key: 'z' }))
  if (plain.prevented || plain.stopped) throw new Error('bare z was swallowed')
  if (execCalls.length !== 0) throw new Error(`unexpected execCommand calls: ${JSON.stringify(execCalls)}`)
  console.log('ok: cmd+s and bare keys pass through untouched')
}

console.log('\nALL CLIPBOARD-PATCH BEHAVIOR CHECKS PASSED')
