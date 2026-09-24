import { LEVEL_SCOPES } from './tabs.js';
export const PREFS_KEY = 'dsh-capability-toggle-plugin:panel-prefs';
export const DEFAULT_PREFS = {
    showFraction: true,
    showUsage: true,
    levels: 'all',
};
function isLevelScope(value) {
    return LEVEL_SCOPES.includes(value);
}
function defaultStorage() {
    if (typeof localStorage === 'undefined')
        return undefined;
    return localStorage;
}
export function readPrefs(storage = defaultStorage()) {
    if (storage === undefined)
        return DEFAULT_PREFS;
    let raw;
    try {
        raw = storage.getItem(PREFS_KEY);
    }
    catch {
        return DEFAULT_PREFS;
    }
    if (raw === null)
        return DEFAULT_PREFS;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return DEFAULT_PREFS;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
        return DEFAULT_PREFS;
    const candidate = parsed;
    if (typeof candidate.showFraction !== 'boolean')
        return DEFAULT_PREFS;
    if (typeof candidate.showUsage !== 'boolean')
        return DEFAULT_PREFS;
    if (typeof candidate.levels !== 'string' || !isLevelScope(candidate.levels))
        return DEFAULT_PREFS;
    return { showFraction: candidate.showFraction, showUsage: candidate.showUsage, levels: candidate.levels };
}
export function writePrefs(prefs, storage = defaultStorage()) {
    if (storage === undefined)
        return;
    try {
        storage.setItem(PREFS_KEY, JSON.stringify(prefs));
    }
    catch {
        return;
    }
}
