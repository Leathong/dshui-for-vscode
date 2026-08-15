// Dev-only: behavioral smoke test for the injected VS Code theme intake
// script (dshui-host-ensure-workspace THEME_PATCH). Runs the exact bytes the
// browser will receive inside a minimal fake DOM and asserts the matchMedia
// shadow + dshui:theme message intake behavior.
import * as fs from 'node:fs'
import * as vm from 'node:vm'

const script = fs.readFileSync('/tmp/themepatch.js', 'utf8')

/** The page's pre-patch matchMedia: every query answered as OS-light. */
function makeRealMatchMedia() {
  const queries = []
  const real = (query) => {
    queries.push(query)
    return {
      media: query,
      matches: false, // the OS prefers light in this harness
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() { return true },
    }
  }
  return { real, queries }
}

function runPatch({ search = '' } = {}) {
  const { real, queries } = makeRealMatchMedia()
  const windowListeners = {}
  const fakeWin = {
    window: null, // self-reference set below
    parent: { postMessage: () => {} },
    location: { search },
    URLSearchParams,
    matchMedia: real,
    addEventListener: (type, fn) => { windowListeners[type] = fn },
  }
  fakeWin.window = fakeWin
  vm.runInNewContext(script, fakeWin)
  const mql = fakeWin.matchMedia('(prefers-color-scheme: dark)')
  const send = (data, source) => {
    const handler = windowListeners.message
    if (!handler) throw new Error('message listener not registered')
    handler({ data, source: source ?? fakeWin.parent })
  }
  return { mql, send, matchMedia: fakeWin.matchMedia, queries }
}

// 1. URL seed: dshui_theme=dark boots dark
{
  const { mql } = runPatch({ search: '?dshui_theme=dark' })
  if (mql.matches !== true) throw new Error('dark URL seed did not resolve dark')
  console.log('ok: ?dshui_theme=dark resolves dark')
}

// 2. URL seed: dshui_theme=light boots light
{
  const { mql } = runPatch({ search: '?dshui_theme=light' })
  if (mql.matches !== false) throw new Error('light URL seed did not resolve light')
  console.log('ok: ?dshui_theme=light resolves light')
}

// 3. No seed (browser / openInBrowser): falls back to the real matchMedia (OS)
{
  const { mql, queries } = runPatch({ search: '' })
  if (mql.matches !== false) throw new Error('no-seed fallback did not resolve light')
  if (!queries.includes('(prefers-color-scheme: dark)')) throw new Error('fallback did not consult the real matchMedia')
  console.log('ok: no seed falls back to the real (OS) scheme')
}

// 4. Live message flips the scheme and fires change listeners exactly once
{
  const { mql, send } = runPatch({ search: '?dshui_theme=light' })
  const changes = []
  mql.addEventListener('change', (event) => { changes.push(event.matches) })
  send({ type: 'dshui:theme', colorScheme: 'dark' })
  if (mql.matches !== true) throw new Error('dark message did not flip matches')
  if (changes.length !== 1 || changes[0] !== true) throw new Error(`expected one dark change, got ${JSON.stringify(changes)}`)
  send({ type: 'dshui:theme', colorScheme: 'light' })
  if (changes.length !== 2 || changes[1] !== false) throw new Error(`expected one light change, got ${JSON.stringify(changes)}`)
  console.log('ok: dshui:theme messages flip the scheme and fire change once per flip')
}

// 5. Re-sending the current scheme is a no-op
{
  const { mql, send } = runPatch({ search: '?dshui_theme=dark' })
  const changes = []
  mql.addEventListener('change', () => { changes.push(1) })
  send({ type: 'dshui:theme', colorScheme: 'dark' })
  if (changes.length !== 0) throw new Error('same-scheme message fired a change')
  console.log('ok: same-scheme message is a no-op')
}

// 6. Foreign messages, invalid schemes, and wrong sources are ignored
{
  const { mql, send } = runPatch({ search: '?dshui_theme=light' })
  const changes = []
  mql.addEventListener('change', () => { changes.push(1) })
  send({ type: 'other', colorScheme: 'dark' }, null)
  send({ type: 'dshui:theme', colorScheme: 'neon' })
  send({ type: 'dshui:theme', colorScheme: 'dark' }, 'someone-else')
  if (changes.length !== 0 || mql.matches !== false) throw new Error('foreign/invalid input leaked through')
  console.log('ok: foreign types, invalid schemes, and wrong sources ignored')
}

// 7. Other media queries delegate to the real implementation
{
  const { matchMedia, queries } = runPatch({ search: '?dshui_theme=dark' })
  const other = matchMedia('(min-width: 600px)')
  if (other.matches !== false || other.media !== '(min-width: 600px)') throw new Error('non-scheme query did not delegate')
  if (!queries.includes('(min-width: 600px)')) throw new Error('non-scheme query did not reach the real matchMedia')
  console.log('ok: non-scheme queries delegate to the real matchMedia')
}

// 8. Listener dedupe and removal
{
  const { mql, send } = runPatch({ search: '?dshui_theme=light' })
  let calls = 0
  const fn = () => { calls += 1 }
  mql.addEventListener('change', fn)
  mql.addEventListener('change', fn) // duplicate registration
  send({ type: 'dshui:theme', colorScheme: 'dark' })
  if (calls !== 1) throw new Error(`duplicate listener fired ${calls} times`)
  mql.removeEventListener('change', fn)
  send({ type: 'dshui:theme', colorScheme: 'light' })
  if (calls !== 1) throw new Error('removed listener still fired')
  console.log('ok: change listeners dedupe and remove')
}

// 9. A throwing listener does not break the relay for the others
{
  const { mql, send } = runPatch({ search: '?dshui_theme=light' })
  const reached = []
  mql.addEventListener('change', () => { throw new Error('boom') })
  mql.addEventListener('change', (event) => { reached.push(event.matches) })
  send({ type: 'dshui:theme', colorScheme: 'dark' })
  if (reached.length !== 1 || reached[0] !== true) throw new Error(`listener after a throwing one was not called: ${JSON.stringify(reached)}`)
  console.log('ok: a throwing listener does not block the others')
}

console.log('\nALL THEME-PATCH BEHAVIOR CHECKS PASSED')
