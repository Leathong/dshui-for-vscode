import { attributeCall } from './inventory.js';
export function applyCallStats(scopedCtx, onCall) {
    return scopedCtx.on('tools/result', (exec) => {
        let id;
        try {
            id = typeof exec?.name === 'string' ? attributeCall(exec.name, exec.arguments) : undefined;
        }
        catch {
            return;
        }
        if (id === undefined)
            return;
        try {
            onCall(id);
        }
        catch {
            return;
        }
    });
}
