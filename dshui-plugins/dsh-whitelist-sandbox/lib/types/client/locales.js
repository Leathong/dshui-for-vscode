/** Locale namespace for the whitelist settings section. */
export const COPY_NS = 'dshui-ui-whitelist';
export const zh = {
    nav: '沙箱白名单',
    hint: '在 workspace-write 之外额外允许写入的路径。最终生效由宿主守卫校验：覆盖 $DSH_HOME 或其下 settings.yaml 的路径会被拒绝，并保留上次生效值（详见服务器日志）。',
    addPlaceholder: '输入绝对路径…',
    add: '添加',
    remove: '移除',
    save: '保存',
    unsaved: '有未保存的修改',
    saved: '已保存，经宿主守卫校验后生效',
    saveFailed: '保存失败：',
    readonly: '当前连接不可写（非本机回环），仅可查看',
    notLoaded: '白名单插件未加载（设置段不可用）',
    loading: '加载中…',
};
export const en = {
    nav: 'Sandbox Whitelist',
    hint: 'Extra writable paths on top of workspace-write. Final application is subject to the host guard: roots covering $DSH_HOME or its settings.yaml are rejected and the previous whitelist is kept (see server log).',
    addPlaceholder: 'Absolute path…',
    add: 'Add',
    remove: 'Remove',
    save: 'Save',
    unsaved: 'Unsaved changes',
    saved: 'Saved; applied after host validation',
    saveFailed: 'Save failed: ',
    readonly: 'Read-only connection (non-loopback); viewing only',
    notLoaded: 'Whitelist plugin not loaded (section unavailable)',
    loading: 'Loading…',
};
