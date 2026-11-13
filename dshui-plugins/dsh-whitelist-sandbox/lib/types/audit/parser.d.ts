import type { Word } from './lexer.ts';
/** One leading `NAME=VALUE` assignment of a simple command. */
export interface Assignment {
    readonly name: string;
    readonly word: Word;
}
/** A file redirect: the target is a real path and needs containment checks. */
export interface FileRedirect {
    readonly kind: 'file';
    readonly operator: string;
    readonly target: Word;
}
/** A `/dev/null` redirect (no file effect). */
export interface NullRedirect {
    readonly kind: 'null';
    readonly operator: string;
}
/** A file-descriptor duplication (`2>&1`). */
export interface FdRedirect {
    readonly kind: 'fd';
    readonly operator: string;
    readonly target: string;
}
/** A file-descriptor close (`2>&-`). */
export interface CloseRedirect {
    readonly kind: 'close';
    readonly operator: string;
    readonly target: '-';
}
/** A heredoc: the body is data for stdin, never executed. */
export interface HeredocRedirect {
    readonly kind: 'heredoc';
    readonly operator: '<<';
    readonly delimiter: string;
    readonly quoted: boolean;
    readonly body: string;
}
/** A here-string (`<<< word`): the word is data, not a path. */
export interface HereStringRedirect {
    readonly kind: 'herestring';
    readonly operator: '<<<';
    readonly target: Word;
}
/** One redirect attached to a simple command. */
export type RedirectNode = FileRedirect | NullRedirect | FdRedirect | CloseRedirect | HeredocRedirect | HereStringRedirect;
/** One simple command: leading assignments, argv words and redirects. */
export interface SimpleCommand {
    readonly assignments: readonly Assignment[];
    readonly words: readonly Word[];
    readonly redirects: readonly RedirectNode[];
}
/** The whole parsed script: every simple command in source order. */
export interface Program {
    readonly commands: readonly SimpleCommand[];
}
/**
 * Parse one `bash -c` source into the spec subset.
 * @param source - the exact command source.
 * @returns the flat, source-ordered command list.
 * @throws AuditError on any construct outside the frozen subset.
 */
export declare function parseScript(source: string): Program;
