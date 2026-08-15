// Dev-only: extract the injected REFERENCE_PATCH browser script from the host
// plugin and syntax-check it as plain JS (CJS-safe subset), so template-literal
// escaping mistakes are caught before reload.
import * as fs from 'node:fs'

const src = fs.readFileSync('dshui-plugins/dshui-host-ensure-workspace/index.js', 'utf8')
const start = src.indexOf('const REFERENCE_PATCH = `<script>')
if (start === -1) {
  console.error('REFERENCE_PATCH not found')
  process.exit(1)
}
const bodyStart = start + 'const REFERENCE_PATCH = `<script>'.length
const end = src.indexOf('</script>`', bodyStart)
if (end === -1) {
  // The template literal escapes the closing tag as <\/script>.
  const escapedEnd = src.indexOf('<\\/script>`', bodyStart)
  if (escapedEnd === -1) {
    console.error('REFERENCE_PATCH terminator not found')
    process.exit(1)
  }
  const raw = src.slice(bodyStart, escapedEnd)
  fs.writeFileSync('/tmp/refpatch.js', raw.replaceAll('\\\\n', '\\n'))
} else {
  fs.writeFileSync('/tmp/refpatch.js', src.slice(bodyStart, end).replaceAll('\\\\n', '\\n'))
}
console.log(`extracted browser script to /tmp/refpatch.js`)
