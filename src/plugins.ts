/**
 * Installs the dshui plugin packages into the dsh home's flat module
 * fallback directory (`$DSH_HOME/profiles/node_modules`), which the dsh
 * loader consults for every profile. Each package is a plain directory (the
 * loader also manages symlinks there for the app closure; unrelated entries
 * are left untouched), so no pnpm run or profile mutation is needed.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

export interface InstalledPlugin {
  /** Bare package name used by patch rows. */
  name: string
  /** Absolute path of the installed package directory. */
  dir: string
}

const PLUGIN_NAMES = [
  'dshui-host-ensure-workspace',
  'dshui-client-ui-workspace',
  'dshui-client-ui-conversation',
  'dsh-rollback-plugin',
  'dsh-whitelist-sandbox',
  'dsh-workspace-scope',
  // IM 机器人插件（随扩展分发，含自带运行时依赖 node_modules）。
  '@xmanrui/dsh-im',
] as const

/** Default dsh home mirroring `@deepseek-ai/dsh-home-paths`. */
export function resolveDshHome(env = process.env): string {
  if (env.DSH_HOME !== undefined && env.DSH_HOME !== '') return env.DSH_HOME
  return path.join(require('node:os').homedir(), '.dsh')
}

/**
 * Copy every dshui plugin package from the extension's `dshui-plugins`
 * directory into the dsh home's flat module fallback
 * (`$DSH_HOME/profiles/node_modules`) — the client-modules manifest
 * resolution anchor — and, when `extensionNodeModules` is given, into the
 * extension's own `node_modules`, which is where the loader's bare-name
 * import falls back to when the embedded Node lacks `module.registerHooks`
 * (Electron's Node). Idempotent; overwrites on each activation so the
 * installed copies track the extension version.
 * @param extensionsRoot - absolute path of the extension's `dshui-plugins` directory.
 * @param dshHome - the dsh home (defaults to `~/.dsh`).
 * @param extensionNodeModules - optional extension-local node_modules target for the loader fallback.
 * @returns the installed plugin records.
 */
export function installPlugins(
  extensionsRoot: string,
  dshHome = resolveDshHome(),
  extensionNodeModules?: string,
): InstalledPlugin[] {
  const targets = [path.join(dshHome, 'profiles', 'node_modules')]
  if (extensionNodeModules !== undefined) targets.push(extensionNodeModules)
  for (const target of targets) fs.mkdirSync(target, { recursive: true })
  const installed: InstalledPlugin[] = []
  for (const name of PLUGIN_NAMES) {
    const source = path.join(extensionsRoot, name)
    for (const targetRoot of targets) {
      const target = path.join(targetRoot, name)
      fs.mkdirSync(target, { recursive: true })
      for (const file of ['package.json', 'index.js', 'client.js']) {
        const from = path.join(source, file)
        if (!fs.existsSync(from)) continue
        fs.copyFileSync(from, path.join(target, file))
      }
      // Bundles may ship their built artifacts in lib/ (e.g. dsh-rollback-plugin).
      const libSource = path.join(source, 'lib')
      if (fs.existsSync(libSource)) fs.cpSync(libSource, path.join(target, 'lib'), { recursive: true })
      // Plugins with external runtime dependencies ship a pruned production
      // node_modules (e.g. @xmanrui/dsh-im: qrcode, dingtalk-stream, ...).
      const depsSource = path.join(source, 'node_modules')
      if (fs.existsSync(depsSource)) {
        fs.cpSync(depsSource, path.join(target, 'node_modules'), { recursive: true })
      }
      // License/notice files for third-party plugins (legal compliance).
      for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
        const from = path.join(source, file)
        if (fs.existsSync(from)) fs.copyFileSync(from, path.join(target, file))
      }
      // The bundle overlay declared by `dsh.bundle.patch` (e.g.
      // @xmanrui/dsh-im/cordis.patch.yml). dsh-app-boot reads it for every
      // package listed in a profile's `dsh.profile.bundles`, so a package
      // that declares it must ship the file, or that profile fails to load.
      const bundlePatch = path.join(source, 'cordis.patch.yml')
      if (fs.existsSync(bundlePatch)) {
        fs.copyFileSync(bundlePatch, path.join(target, 'cordis.patch.yml'))
      }
    }
    installed.push({ name, dir: path.join(targets[0], name) })
  }
  return installed
}

/** The profile `dshServer` boots (`dsh --profile web`). */
const PROFILE_NAME = 'web'

/** The one dshui plugin that must be a PROFILE BUNDLE rather than a `--patch`
 * row: only a bundle-layer row (layer 1) is visible when `configEditor` writes
 * the settings row into the profile patch (layer 2). Its own
 * `cordis.patch.yml` atomically disables `bash-sandbox` / `fs-sandbox` and
 * inserts the whitelist replacement, so a missing package degrades to the
 * stock sandbox instead of stripping `shell`/`fs`. */
const PROFILE_BUNDLE_PLUGIN = 'dsh-whitelist-sandbox'

/** Bundles the shipped `web` profile template starts from, mirrored from
 * `@deepseek-ai/dsh-app-boot`'s `PROFILE_TEMPLATES.web`. The extension host is
 * CJS and cannot `require` that ESM package, so the seed is duplicated here. */
const WEB_PROFILE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] as const

/** `initProfile`'s empty user patch layer, mirrored for profile bootstrap. */
const PROFILE_PATCH_TEMPLATE = '# Your patch layer for this dsh profile, applied after every bundle layer:\n[]\n'
/** `initProfile`'s pnpm settings for out-of-tree plugins, mirrored for bootstrap. */
const PROFILE_PNPM_WORKSPACE = 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n'

/** The subset of a dsh profile manifest this module reads and extends. */
interface ProfileManifestLike {
  name?: string
  private?: boolean
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
  [key: string]: unknown
}

/**
 * Ensure the booted profile lists {@link PROFILE_BUNDLE_PLUGIN} in
 * `dsh.profile.bundles`, so the plugin's own bundle patch (layer 1) runs
 * before the user patch (layer 2) the settings page edits. Also bootstraps the
 * profile's companion files when it does not exist yet, mirroring
 * `initProfile`; existing files are only ever extended, never replaced.
 * @param dshHome - the dsh home (defaults to `~/.dsh`).
 * @param profileName - the profile `dshServer` boots (defaults to `web`).
 * @returns whether the manifest changed.
 */
export function ensureProfileBundle(dshHome = resolveDshHome(), profileName = PROFILE_NAME): boolean {
  const dir = path.join(dshHome, 'profiles', profileName)
  fs.mkdirSync(dir, { recursive: true })
  const patchPath = path.join(dir, 'cordis.patch.yml')
  if (!fs.existsSync(patchPath)) fs.writeFileSync(patchPath, PROFILE_PATCH_TEMPLATE)
  const workspacePath = path.join(dir, 'pnpm-workspace.yaml')
  if (!fs.existsSync(workspacePath)) fs.writeFileSync(workspacePath, PROFILE_PNPM_WORKSPACE)
  const manifestPath = path.join(dir, 'package.json')
  const manifest: ProfileManifestLike = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ProfileManifestLike
    : { name: `dsh-profile-${profileName}`, private: true, dependencies: {}, dsh: { profile: { bundles: [...WEB_PROFILE_BUNDLES] } } }
  const declared = manifest.dsh?.profile?.bundles
  const bundles = Array.isArray(declared) ? declared : [...WEB_PROFILE_BUNDLES]
  if (bundles.includes(PROFILE_BUNDLE_PLUGIN)) return false
  manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...bundles, PROFILE_BUNDLE_PLUGIN] } }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
  return true
}

/**
 * Remove the dshui plugin packages from the dsh home. Used on extension
 * deactivation so uninstalling the extension leaves no residue.
 * @param dshHome - the dsh home.
 */
export function uninstallPlugins(dshHome = resolveDshHome()): void {
  const modulesDir = path.join(dshHome, 'profiles', 'node_modules')
  for (const name of PLUGIN_NAMES) {
    const target = path.join(modulesDir, name)
    try {
      fs.rmSync(target, { recursive: true, force: true })
      // Scoped packages leave their scope directory behind; drop it if empty.
      if (name.startsWith('@')) {
        const scopeDir = path.dirname(target)
        if (fs.readdirSync(scopeDir).length === 0) fs.rmdirSync(scopeDir)
      }
    } catch {
      // best-effort cleanup; nothing else to do
    }
  }
}
