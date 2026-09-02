window.__ModuleLoader__.load({
	id: "dsh-whitelist-sandbox",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		//#region \0@oxc-project+runtime@0.135.0/helpers/esm/typeof.js
		function _typeof(o) {
			"@babel/helpers - typeof";
			return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
				return typeof o;
			} : function(o) {
				return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
			}, _typeof(o);
		}
		//#endregion
		//#region \0@oxc-project+runtime@0.135.0/helpers/esm/toPrimitive.js
		function toPrimitive(t, r) {
			if ("object" != _typeof(t) || !t) return t;
			var e = t[Symbol.toPrimitive];
			if (void 0 !== e) {
				var i = e.call(t, r || "default");
				if ("object" != _typeof(i)) return i;
				throw new TypeError("@@toPrimitive must return a primitive value.");
			}
			return ("string" === r ? String : Number)(t);
		}
		//#endregion
		//#region \0@oxc-project+runtime@0.135.0/helpers/esm/toPropertyKey.js
		function toPropertyKey(t) {
			var i = toPrimitive(t, "string");
			return "symbol" == _typeof(i) ? i : i + "";
		}
		//#endregion
		//#region \0@oxc-project+runtime@0.135.0/helpers/esm/defineProperty.js
		function _defineProperty(e, r, t) {
			return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
				value: t,
				enumerable: !0,
				configurable: !0,
				writable: !0
			}) : e[r] = t, e;
		}
		//#endregion
		//#region lib/types/client/store.js
		/**
		* Whitelist settings store: reads the `sandbox-whitelist` settings namespace
		* through `settingsScope.describe()` and writes `extraWritableRoots` as one
		* revision-checked `settings.mutate`. Split from the React section so the
		* logic is unit-testable without pulling in the browser bundle.
		*/
		/** The settings-document namespace this section reads/writes. */
		const SETTINGS_NS = "sandbox-whitelist";
		const SETTINGS_FIELD = "extraWritableRoots";
		var WhitelistSettingsStore = class {
			constructor(settingsScope, settingsRemote) {
				_defineProperty(this, "settingsRemote", void 0);
				_defineProperty(this, "store", (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({
					status: "loading",
					writable: false,
					roots: [],
					revision: void 0
				}));
				_defineProperty(this, "disposed", false);
				_defineProperty(this, "describeFace", void 0);
				this.settingsRemote = settingsRemote;
				this.describeFace = settingsScope.describe();
			}
			getSnapshot() {
				return this.store.getSnapshot();
			}
			subscribe(listener) {
				return this.store.subscribe(listener);
			}
			async load() {
				if (this.disposed) return;
				try {
					await this.describeFace.ensure();
				} catch {
					return;
				}
				const mirrored = this.describeFace.getSnapshot();
				if (mirrored.view === void 0) {
					this.store.update((draft) => {
						draft.writable = false;
						draft.status = "unavailable";
						draft.roots = [];
						draft.revision = void 0;
					});
					return;
				}
				const view = mirrored.view.namespaces.find((candidate) => candidate.ns === SETTINGS_NS);
				this.store.update((draft) => {
					draft.writable = mirrored.view.writable === true;
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
				if (this.disposed) return {
					ok: false,
					error: "disposed"
				};
				const revision = this.getSnapshot().revision;
				let response;
				try {
					response = await this.settingsRemote.mutate(SETTINGS_NS, [{
						op: "set",
						path: [SETTINGS_FIELD],
						value: roots
					}], revision);
				} catch (error) {
					return {
						ok: false,
						error: String(error)
					};
				}
				if (response.ok !== true) return {
					ok: false,
					error: response.error?.message ?? "settings write rejected"
				};
				await this.load();
				return { ok: true };
			}
			dispose() {
				this.disposed = true;
			}
		};
		//#endregion
		//#region lib/types/client/locales.js
		/** Locale namespace for the whitelist settings section. */
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
		//#endregion
		//#region lib/types/client/index.js
		/**
		* dsh-whitelist-sandbox, browser half: a `settings.section` for the sandbox
		* whitelist.
		*
		* Security contract (mirrors the host plugin's):
		*  - The form reads/writes ONLY the `sandbox-whitelist:` settings-document
		*    section through the existing settings transport
		*    (`settingsScope.describe()` + `ctx.remote.settings.mutate`) — the same
		*    channel the Models page uses. There is no second, bypass write path.
		*  - The authoritative guard (reject roots covering $DSH_HOME /
		*    settings.yaml, keep-last-good) runs host-side in dsh-whitelist-sandbox
		*    when the change is applied; the UI shows the document value and a
		*    notice that final application is subject to that guard.
		*  - Nothing model-controlled is ever rendered into this form; inputs are
		*    operator-typed paths only.
		*/
		/** The settings-page section: edit the whitelist path list, save via the document. */
		function WhitelistSection({ controller, t }) {
			const state = (0, react.useSyncExternalStore)((listener) => controller.subscribe(listener), () => controller.getSnapshot());
			const [draft, setDraft] = (0, react.useState)("");
			const [pending, setPending] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)(null);
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
						setNotice({
							ok: true,
							message: t("saved")
						});
					} else setNotice({
						ok: false,
						message: t("saveFailed") + result.error
					});
				} finally {
					setSaving(false);
				}
			};
			const row = (index, path) => (0, react_jsx_runtime.jsx)("li", {
				key: index,
				style: {
					display: "flex",
					alignItems: "center",
					gap: "8px",
					padding: "4px 0"
				},
				children: [(0, react_jsx_runtime.jsx)("span", {
					style: {
						flex: "1",
						overflowWrap: "anywhere",
						fontFamily: "monospace",
						fontSize: "12px"
					},
					children: path
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					size: "sm",
					icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {}),
					"aria-label": t("remove"),
					onClick: () => remove(index)
				})]
			});
			const editable = state.writable && state.status === "ready";
			return (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: "12px",
					maxWidth: "720px"
				},
				children: [
					(0, react_jsx_runtime.jsx)("p", {
						style: {
							margin: 0,
							color: "var(--dsw-alias-label-secondary)",
							fontSize: "12px",
							lineHeight: "1.6"
						},
						children: t("hint")
					}),
					state.status === "loading" && (0, react_jsx_runtime.jsx)("p", { children: t("loading") }),
					state.status === "unavailable" && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: t("notLoaded")
					}),
					(0, react_jsx_runtime.jsx)("ul", {
						style: {
							listStyle: "none",
							margin: 0,
							padding: 0
						},
						children: roots.map((path, index) => row(index, path))
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: "8px",
							alignItems: "center"
						},
						children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							style: { flex: "1" },
							value: draft,
							placeholder: t("addPlaceholder"),
							disabled: !editable,
							onChange: (event) => setDraft(event.target.value),
							onKeyDown: (event) => {
								if (event.key === "Enter") add();
							}
						}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							size: "sm",
							icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {}),
							disabled: !editable || draft.trim() === "",
							onClick: add,
							children: t("add")
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: "12px",
							alignItems: "center"
						},
						children: [
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								size: "sm",
								disabled: !editable || saving || !dirty,
								onClick: save,
								children: t("save")
							}),
							dirty && (0, react_jsx_runtime.jsx)("span", {
								style: {
									color: "var(--dsw-alias-label-tertiary)",
									fontSize: "12px"
								},
								children: t("unsaved")
							}),
							notice !== null && (0, react_jsx_runtime.jsx)("span", {
								role: notice.ok ? "status" : "alert",
								style: {
									color: notice.ok ? "var(--dsw-alias-ok)" : "var(--dsw-alias-danger)",
									fontSize: "12px"
								},
								children: notice.message
							})
						]
					}),
					!state.writable && state.status !== "loading" && (0, react_jsx_runtime.jsx)("p", {
						style: {
							margin: 0,
							color: "var(--dsw-alias-label-tertiary)",
							fontSize: "12px"
						},
						children: t("readonly")
					})
				]
			});
		}
		/**
		* Required client services. Both the base `remote` service and the
		* `remote.settings` namespace must be injected: `ctx.remote` builds the
		* accessor receiver, and `remote.settings` (the settings-document Remote
		* namespace mounted by dsh-api-remotes) is the exposed sub-service the
		* section reads/writes through `ctx.remote.settings`.
		*/
		const inject = [
			"slots",
			"locale",
			"settingsScope",
			"remote",
			"remote.settings"
		];
		/**
		* Register the whitelist section once the `settings.section` declaration
		* is on the ledger, wire its store to the settings scope, and refresh on
		* every pushed settings invalidation.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(COPY_NS, {
				zh,
				en
			}), "dsh-whitelist-sandbox: dictionaries");
			const t = ctx.locale.bind(COPY_NS);
			const controller = new WhitelistSettingsStore(ctx.settingsScope, ctx.remote.settings);
			const injected = () => ({
				controller,
				t
			});
			ctx.effect(() => {
				const refresh = () => {
					controller.load();
				};
				controller.load();
				const dispose = controller.describeFace.subscribe(refresh);
				return () => {
					dispose();
					controller.dispose();
				};
			}, "dsh-whitelist-sandbox: settings scope");
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
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map