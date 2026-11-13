/** One shell word after quote removal; expansions are kept as their source
 * text (such words can never be a command word or a file target). */
export interface Word {
    /** Quote-removed token text; expansion source text is kept verbatim. */
    readonly value: string;
    /** Whether any part of the word was quoted or escaped (this also makes the
     * word a *quoted* heredoc delimiter). */
    readonly quoted: boolean;
    /** Whether the word contains a parameter expansion. */
    readonly expanded: boolean;
    /** Whether the word contains an unquoted glob character. */
    readonly glob: boolean;
    /** Whether the word contains an unquoted `~`. */
    readonly tilde: boolean;
    /** The variable name when the word starts with `NAME=`. */
    readonly assignmentName?: string;
}
/** A word token. */
export interface WordToken {
    readonly type: 'word';
    readonly word: Word;
}
/** An operator token (`;`, `&&`, `|`, `>`, `<<`, `(`, …). */
export interface OperatorToken {
    readonly type: 'op';
    readonly value: string;
}
/** A newline token (also a statement separator). */
export interface NewlineToken {
    readonly type: 'newline';
}
/** One lexed token. */
export type Token = WordToken | OperatorToken | NewlineToken;
/** One heredoc: its delimiter as written (quotes removed), whether it was
 * quoted, and its raw body. */
export interface HeredocBody {
    readonly delimiter: string;
    readonly quoted: boolean;
    readonly body: string;
}
/** The lexer's full output: tokens plus heredoc bodies keyed by the index of
 * their `<<` operator token. */
export interface LexResult {
    readonly tokens: readonly Token[];
    readonly heredocs: ReadonlyMap<number, HeredocBody>;
}
/**
 * Lex one `bash -c` source into the P1 subset.
 * @param source - the exact command source.
 * @returns the token stream and every heredoc body.
 * @throws AuditError on any construct outside the frozen subset.
 */
export declare function tokenize(source: string): LexResult;
