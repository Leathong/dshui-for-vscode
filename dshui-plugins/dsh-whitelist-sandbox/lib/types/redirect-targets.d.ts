import type { Redirect } from './command-whitelist.ts';
/** The writable areas a redirect target may live in. */
export interface WritableRoots {
    /** The session's workspace root (always writable under `workspace-write`). */
    workspaceRoot: string;
    /** Extra roots the resolved sandbox policy already carries. */
    additionalWritableRoots?: readonly string[];
    /** This plugin's `extraWritableRoots` (live). */
    extraWritableRoots: readonly string[];
}
/**
 * Whether every file redirect of one whitelisted line targets a writable area.
 *
 * Call this only with file redirects taken from a line whose simple commands
 * all matched the whitelist, and only when the line is a SINGLE simple command:
 * a simple command's redirections are performed before the command runs, so a
 * relative target resolves against `workdir`, while an earlier segment of a
 * compound line could create a symlink or change the cwd first.
 * @param redirects - every redirect the line carries (effect-free ones are ignored).
 * @param workdir - the shell's starting directory (the resolved spec workdir).
 * @param roots - workspace root, policy extra roots and this plugin's roots.
 * @returns true when every file target is physically inside a writable area.
 */
export declare function redirectsWithinWritableRoots(redirects: readonly Redirect[], workdir: string, roots: WritableRoots): Promise<boolean>;
