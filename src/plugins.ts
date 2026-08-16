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
    }
    installed.push({ name, dir: path.join(targets[0], name) })
  }
  return installed
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
    } catch {
      // best-effort cleanup; nothing else to do
    }
  }
}
