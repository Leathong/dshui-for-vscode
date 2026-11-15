#!/usr/bin/env node
/**
 * Fingerprint the distribution payload the embedded dsh server imports at boot:
 * the `dshui-plugins/` package files plus `patch.yml`.
 *
 * The extension folds this fingerprint into `CLIENT_BUILD_REV` (see
 * `src/sharedBackend.ts`). A `make sync` that changes host-plugin code or the
 * patch overlay therefore counts as a different build even when the extension
 * version did not change, so a window re-attaching to a still-running shared
 * server reclaims the port instead of silently running the previous code the
 * dsh loader already imported. Unchanged payloads keep the same fingerprint, so
 * a plain reload still adopts the live server (a running turn survives).
 *
 * Runs as the first step of `compile` and writes `dshui-plugins/payload-rev.json`
 * (generated, gitignored, shipped in the vsix).
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PAYLOAD_DIR = path.join(ROOT, 'dshui-plugins')
const PATCH_FILE = path.join(ROOT, 'patch.yml')
const STAMP_FILE = path.join(PAYLOAD_DIR, 'payload-rev.json')
/** Finder metadata must not make the fingerprint machine-dependent. */
const SKIP_FILES = new Set(['.DS_Store'])

/**
 * Collect the files whose contents the server may import. Dependency trees are
 * included (a host plugin's pruned `node_modules` is imported by its bundle);
 * symlinks are skipped so a dangling `.bin` entry cannot fail the build and a
 * link target is never hashed twice under two names.
 */
function collectFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, out)
    else if (entry.isFile() && !SKIP_FILES.has(entry.name) && full !== STAMP_FILE) out.push(full)
  }
}

/**
 * Compute the payload fingerprint.
 * @returns {{ rev: string, files: number }} the digest and how many files fed it.
 */
export function computePayloadRev() {
  const files = []
  collectFiles(PAYLOAD_DIR, files)
  if (fs.existsSync(PATCH_FILE)) files.push(PATCH_FILE)
  const relative = new Map(files.map((file) => [file, path.relative(ROOT, file).split(path.sep).join('/')]))
  files.sort((left, right) => relative.get(left) < relative.get(right) ? -1 : relative.get(left) > relative.get(right) ? 1 : 0)
  const hash = createHash('sha256')
  for (const file of files) {
    const content = fs.readFileSync(file)
    hash.update(relative.get(file))
    hash.update('\0')
    hash.update(String(content.length))
    hash.update('\0')
    hash.update(content)
  }
  return { rev: hash.digest('hex').slice(0, 16), files: files.length }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = Date.now()
  const { rev, files } = computePayloadRev()
  fs.writeFileSync(STAMP_FILE, `${JSON.stringify({ rev, files })}\n`)
  console.log(`dshui payload rev ${rev} (${files} files, ${Date.now() - started} ms)`)
}
