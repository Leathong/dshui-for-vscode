window.__ModuleLoader__.load({
	id: "dsh-client-ui-whitelist",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _client_runtime = require("@deepseek-ai/dsh-client-runtime/client");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		const { jsx, jsxs } = react_jsx_runtime;
		//#region lib/types/client/index.js
		/**
		* dsh-client-ui-whitelist: a `settings.section` for the sandbox whitelist.
		*
		* Security contract (mirrors the host plugin's):
		*  - The form reads/writes ONLY the `sandbox-whitelist:` settings-document
		*    section through the existing settings transport
		*    (`connection.api.settings.describe/mutate`) — the same channel the
		*    Models page uses. There is no second, bypass write path.
		*  - The authoritative guard (reject roots covering $DSH_HOME /
		*    settings.yaml, keep-last-good) runs host-side in dsh-whitelist-sandbox
		*    when the change is applied; the UI shows the document value and a
		*    notice that final application is subject to that guard.
		*  - Nothing model-controlled is ever rendered into this form; inputs are
		*    operator-typed paths only.
		*/
		const NS = "sandbox-whitelist";
		const COPY_NS = "dshui-ui-whitelist";
		const zh = {
			nav: "沙箱白名单",
			hint: "在 workspace-write 之外额外允许写入的路径。最终生效由宿主守卫校验：覆盖 $DSH_HOME 或其下 settings.yaml 的路径会被拒绝，并保留上次生效值（详见服务器日志）。",
			addPlaceholder: "输入绝对路径…",
			add: "添加",
			remove: "移除",
			save: "保存",
			unsaved: "有未保存的修改",
			saved: "已保存，经宿主守卫校验后生效",
			saveFailed: "保存失败：",
			readonly: "当前连接不可写（非本机回环），仅可查看",
			notLoaded: "白名单插件未加载（设置段不可用）",
			loading: "加载中…"
		};
		const en = {
			nav: "Sandbox Whitelist",
			hint: "Extra writable paths on top of workspace-write. Final application is subject to the host guard: roots covering $DSH_HOME or its settings.yaml are rejected and the previous whitelist is kept (see server log).",
			addPlaceholder: "Absolute path…",
			add: "Add",
			remove: "Remove",
			save: "Save",
			unsaved: "Unsaved changes",
			saved: "Saved; applied after host validation",
			saveFailed: "Save failed: ",
			readonly: "Read-only connection (non-loopback); viewing only",
			notLoaded: "Whitelist plugin not loaded (section unavailable)",
			loading: "Loading…"
		};
		/**
		* Read the `sandbox-whitelist` namespace through the settings transport
		* and write `extraWritableRoots` as one revision-checked document update.
		* Kept intentionally small: refresh on pushed invalidations, fail quietly
		* on transport errors (a later invalidation re-reads).
		*/
		var WhitelistSettingsStore = class {
			constructor(api) {
				this.api = api;
				this.disposed = false;
				this.store = _client_runtime.createSnapshotStore({
					status: "loading",
					writable: false,
					roots: [],
					revision: void 0
				});
			}
			getSnapshot() {
				return this.store.getSnapshot();
			}
			subscribe(listener) {
				return this.store.subscribe(listener);
			}
			async load() {
				if (this.disposed) return;
				let response;
				try {
					response = await this.api.settings.describe({});
				} catch (_settingsReadFailure) {
					return;
				}
				if (response?.result?.ok !== true || this.disposed) return;
				const value = response.result.value;
				const view = value.namespaces.find((candidate) => candidate.ns === NS);
				this.store.update((draft) => {
					draft.writable = value.writable === true;
					if (view === void 0) {
						draft.status = "unavailable";
						draft.roots = [];
						draft.revision = void 0;
						return;
					}
					draft.status = "ready";
					draft.revision = view.revision;
					draft.roots = Array.isArray(view.value?.extraWritableRoots) ? view.value.extraWritableRoots : [];
				});
			}
			async save(roots) {
				if (this.disposed) return { ok: false, error: "disposed" };
				const revision = this.getSnapshot().revision;
				let response;
				try {
					response = await this.api.settings.mutate({
						ns: NS,
						ops: [{
							op: "set",
							path: ["extraWritableRoots"],
							value: roots
						}],
						...revision === void 0 ? {} : { expectedRevision: revision }
					});
				} catch (error) {
					return { ok: false, error: String(error) };
				}
				if (response?.result?.ok !== true) return { ok: false, error: "settings write rejected" };
				await this.load();
				return { ok: true };
			}
			dispose() {
				this.disposed = true;
			}
		};
		/** The settings-page section: edit the whitelist path list, save via the document. */
		function WhitelistSection({ controller, t }) {
			// React calls subscribe/getSnapshot as bare functions (this === undefined),
			// so the store methods must be bound through closures, not passed unbound.
			const state = react.useSyncExternalStore((listener) => controller.subscribe(listener), () => controller.getSnapshot());
			const [draft, setDraft] = react.useState("");
			const [pending, setPending] = react.useState(null);
			const [saving, setSaving] = react.useState(false);
			const [notice, setNotice] = react.useState(null);
			const storeRoots = state.status === "ready" ? state.roots : [];
			const roots = pending === null ? storeRoots : pending;
			const dirty = pending !== null;
			const mark = (next) => {
				setPending(next);
				setNotice(null);
			};
			const add = () => {
				const value = draft.trim();
				if (value === "") return;
				mark([...roots, value]);
				setDraft("");
			};
			const remove = (index) => {
				mark(roots.filter((_, cursor) => cursor !== index));
			};
			const save = async () => {
				setSaving(true);
				try {
					const result = await controller.save(roots);
					if (result.ok) {
						setPending(null);
						setNotice({ ok: true, message: t("saved") });
					} else {
						setNotice({ ok: false, message: t("saveFailed") + result.error });
					}
				} finally {
					setSaving(false);
				}
			};
			const row = (index, path) => jsx("li", {
				key: index,
				style: { display: "flex", alignItems: "center", gap: "8px", padding: "4px 0" },
				children: [
					jsx("span", { style: { flex: "1", overflowWrap: "anywhere", fontFamily: "monospace", fontSize: "12px" }, children: path }),
					jsx(primitives.Button, {
						variant: "ghost",
						size: "sm",
						icon: jsx(primitives.IconTrashOutline16, {}),
						"aria-label": t("remove"),
						onClick: () => remove(index)
					})
				]
			});
			const editable = state.writable && state.status === "ready";
			return jsxs("div", {
				style: { display: "flex", flexDirection: "column", gap: "12px", maxWidth: "720px" },
				children: [
					jsx("p", { style: { margin: 0, color: "var(--dsw-alias-label-secondary)", fontSize: "12px", lineHeight: "1.6" }, children: t("hint") }),
					state.status === "loading" && jsx("p", { children: t("loading") }),
					state.status === "unavailable" && jsx("p", { role: "alert", children: t("notLoaded") }),
					jsx("ul", {
						style: { listStyle: "none", margin: 0, padding: 0 },
						children: roots.map((path, index) => row(index, path))
					}),
					jsxs("div", {
						style: { display: "flex", gap: "8px", alignItems: "center" },
						children: [
							jsx(primitives.Input, {
								style: { flex: "1" },
								value: draft,
								placeholder: t("addPlaceholder"),
								disabled: !editable,
								onChange: (event) => setDraft(event.target.value),
								onKeyDown: (event) => {
									if (event.key === "Enter") add();
								}
							}),
							jsx(primitives.Button, {
								variant: "outline",
								size: "sm",
								icon: jsx(primitives.IconPlusOutline16, {}),
								disabled: !editable || draft.trim() === "",
								onClick: add,
								children: t("add")
							})
						]
					}),
					jsxs("div", {
						style: { display: "flex", gap: "12px", alignItems: "center" },
						children: [
							jsx(primitives.Button, {
								variant: "primary",
								size: "sm",
								disabled: !editable || saving || !dirty,
								onClick: save,
								children: t("save")
							}),
							dirty && jsx("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" }, children: t("unsaved") }),
							notice !== null && jsx("span", {
								role: notice.ok ? "status" : "alert",
								style: { color: notice.ok ? "var(--dsw-alias-ok)" : "var(--dsw-alias-danger)", fontSize: "12px" },
								children: notice.message
							})
						]
					}),
					!state.writable && state.status !== "loading" && jsx("p", { style: { margin: 0, color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" }, children: t("readonly") })
				]
			});
		}
		/** Required client services: the section slot ledger, copy, transport, and forwarded host events. */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote"
		];
		/**
		* Register the whitelist section once the `settings.section` declaration
		* is on the ledger, wire its store to the connection, and refresh on
		* every pushed settings invalidation.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(COPY_NS, {
				zh,
				en
			}), "dsh-client-ui-whitelist: dictionaries");
			const t = ctx.locale.bind(COPY_NS);
			const connection = ctx.get("connection");
			const controller = new WhitelistSettingsStore(connection.api);
			const injected = () => ({
				controller,
				t
			});
			ctx.effect(() => {
				const refresh = (ns) => {
					if (ns !== void 0 && ns !== NS) return;
					controller.load();
				};
				const disposers = [
					ctx.remote.$on("settings/document-updated", refresh),
					ctx.on("connection/reset", () => {
						refresh();
					})
				];
				controller.load();
				return () => {
					for (const dispose of disposers) dispose();
					controller.dispose();
				};
			}, "dsh-client-ui-whitelist: settings scope");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "whitelist",
				order: 20,
				label: () => t("nav"),
				inject: injected
			}, WhitelistSection));
		}
		//#endregion
		exports.WhitelistSection = WhitelistSection;
		exports.WhitelistSettingsStore = WhitelistSettingsStore;
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
