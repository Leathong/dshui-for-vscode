// Dev-only: extract the injected THEME_PATCH browser script from the host
// plugin and syntax-check it as plain JS (CJS-safe subset), so template-literal
// escaping mistakes are caught before reload. Writes the extracted script to
// /tmp/themepatch.js for scripts/test-theme-patch.mjs.
import * as fs from 'node:fs'
import * as vm from 'node:vm'

const src = fs.readFileSync('dshui-plugins/dshui-host-ensure-workspace/index.js', 'utf8')
const start = src.indexOf('const THEME_PATCH = `<script>')
if (start === -1) {
  console.error('THEME_PATCH not found')
  process.exit(1)
}
const bodyStart = start + 'const THEME_PATCH = `<script>'.length
let raw
const end = src.indexOf('</script>`', bodyStart)
if (end === -1) {
  // The template literal escapes the closing tag as <\/script>.
  const escapedEnd = src.indexOf('<\\/script>`', bodyStart)
  if (escapedEnd === -1) {
    console.error('THEME_PATCH terminator not found')
    process.exit(1)
  }
  raw = src.slice(bodyStart, escapedEnd)
} else {
  raw = src.slice(bodyStart, end)
}
// No runtime-escaped backslashes are expected in THEME_PATCH; normalize them
// anyway so a future edit adding string escapes cannot silently diverge.
const script = raw.replaceAll('\\\\n', '\\n')
try {
  new vm.Script(script)
} catch (error) {
  console.error('THEME_PATCH syntax error:', error)
  process.exit(1)
}
fs.writeFileSync('/tmp/themepatch.js', script)
console.log(`extracted browser script to /tmp/themepatch.js (${script.length} bytes, syntax ok)`)
