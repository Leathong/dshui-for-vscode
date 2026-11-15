window.__ModuleLoader__.load({
	id: "dsh-whitelist-sandbox",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
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
		* Whitelist settings store: the browser-side projection of this plugin's own
		* profile entry, read and written through the shared `configForms` service.
		* The entry id IS the settings namespace (0.1.7+ moved settings from
		* `$DSH_HOME/settings.yaml` sections into the profile patch document, keyed by
		* loader entry id), and the two volatile fields are `extraWritableRoots` and
		* `unsandboxedCommands`.
		* Split from the React section so the logic is unit-testable without pulling
		* in the browser bundle.
		*/
		/** This plugin's profile entry id — the settings namespace its Host row
		* carries. Must match `cordis.patch.yml`'s inserted id. */
		const SETTINGS_NS = "dsh-whitelist-sandbox";
		/** Extra writable roots field. */
		const SETTINGS_FIELD_ROOTS = "extraWritableRoots";
		/** Commands that run outside the sandbox field. */
		const SETTINGS_FIELD_COMMANDS = "unsandboxedCommands";
		function listOf(value) {
			return Array.isArray(value) ? [...value] : [];
		}
		/**
		* Read-only projection plus the two field writes. The derived snapshot is
		* cached by the underlying form snapshot's identity so `useSyncExternalStore`
		* sees a stable reference between real changes.
		*/
		var WhitelistSettingsStore = class {
			constructor(form) {
				_defineProperty(this, "form", void 0);
				_defineProperty(this, "lastForm", void 0);
				_defineProperty(this, "cached", {
					status: "loading",
					writable: false,
					roots: [],
					commands: [],
					revision: void 0
				});
				this.form = form;
			}
			getSnapshot() {
				const snapshot = this.form.getSnapshot();
				if (snapshot !== this.lastForm) {
					this.lastForm = snapshot;
					const ready = snapshot.status === "ready";
					this.cached = {
						status: snapshot.status,
						writable: snapshot.writable,
						roots: ready ? listOf(snapshot.value?.extraWritableRoots) : [],
						commands: ready ? listOf(snapshot.value?.unsandboxedCommands) : [],
						revision: snapshot.revision
					};
				}
				return this.cached;
			}
			subscribe(listener) {
				return this.form.subscribe(listener);
			}
			/** Write the extra writable roots. */
			saveRoots(roots) {
				return this.write(SETTINGS_FIELD_ROOTS, roots);
			}
			/** Write the commands that run outside the sandbox. */
			saveCommands(commands) {
				return this.write(SETTINGS_FIELD_COMMANDS, commands);
			}
			async write(field, values) {
				let accepted;
				try {
					accepted = await this.form.set(field, values);
				} catch (error) {
					return {
						ok: false,
						error: String(error)
					};
				}
				return accepted ? { ok: true } : {
					ok: false,
					error: "settings write rejected"
				};
			}
			/** The form is owned by the shared `configForms` provider; nothing to release. */
			dispose() {}
		};
		//#endregion
		//#region lib/types/client/locales.js
		/** Locale namespace for the whitelist settings section. */
		const COPY_NS = "dshui-ui-whitelist";
		const zh = {
			nav: "沙箱白名单",
			hint: "两组操作员白名单：额外可写路径，以及直接在本机执行（不经沙箱）的命令前缀。最终生效由宿主守卫校验：非法条目会被拒绝保存，已存在的坏条目会被忽略并保留其余生效值（详见服务器日志）。",
			rootsTitle: "额外可写路径",
			rootsHint: "在 workspace-write 之外额外允许写入的路径（bash 与 write/edit 同时遵守）。覆盖 $DSH_HOME 或其下 settings.yaml 的路径会被拒绝。",
			commandsTitle: "免沙箱命令",
			commandsHint: "按字面前缀匹配（如 git / git status）：整条调用通过静态审计才免沙箱。允许 if/case/for/while、注释、$VAR/${VAR}（无命令替换）、heredoc、cd、管道；禁止 $(...)、反引号、算术、后台 &、export/set/hash/enable/trap 等、函数、前缀赋值、相对/动态重定向。文件重定向用工作区内的绝对路径。被沙箱拒绝时结果会附上原因与改写建议。注意：把 node、python、flutter 之类的执行器加白，等同完全信任它能运行的任意代码。",
			addPlaceholder: "输入绝对路径…",
			commandAddPlaceholder: "输入命令前缀，如 git status…",
			add: "添加",
			remove: "移除",
			save: "保存",
			unsaved: "有未保存的修改",
			saved: "已保存，经宿主守卫校验后生效",
			saveFailed: "保存失败：",
			empty: "（空）",
			readonly: "当前连接不可写（非本机回环），仅可查看",
			notLoaded: "白名单插件未加载（设置段不可用）",
			loading: "加载中…"
		};
		const en = {
			nav: "Sandbox Whitelist",
			hint: "Two operator-owned whitelists: extra writable paths, and command prefixes that run directly on the host outside the sandbox. Final application is subject to the host guard: unusable entries are refused on save, and a bad stored entry is ignored while the rest stays effective (see the server log).",
			rootsTitle: "Extra writable paths",
			rootsHint: "Extra writable paths on top of workspace-write (honored by both bash and write/edit). Roots covering $DSH_HOME or its settings.yaml are rejected.",
			commandsTitle: "Unsandboxed commands",
			commandsHint: "Literal prefix match (git, git status): the whole call must pass the static audit. if/case/for/while, comments, $VAR/${VAR} (no command substitution), heredocs, cd and pipelines are allowed; $(...), backticks, arithmetic, background &, export/set/hash/enable/trap, functions, prefix assignments and relative/dynamic redirects are not. Use absolute redirect paths inside the workspace. A sandbox denial now explains why the call was not exempt and how to rewrite it. Note: whitelisting an executor such as node, python or flutter means fully trusting the code it can run.",
			addPlaceholder: "Absolute path…",
			commandAddPlaceholder: "Command prefix, e.g. git status…",
			add: "Add",
			remove: "Remove",
			save: "Save",
			unsaved: "Unsaved changes",
			saved: "Saved; applied after host validation",
			saveFailed: "Save failed: ",
			empty: "(empty)",
			readonly: "Read-only connection (non-loopback); viewing only",
			notLoaded: "Whitelist plugin not loaded (section unavailable)",
			loading: "Loading…"
		};
		//#endregion
		//#region lib/types/client/index.js
		/**
		* dsh-whitelist-sandbox, browser half: a `settings.section` for the sandbox
		* whitelist — extra writable paths plus commands that run outside the sandbox.
		*
		* Security contract (mirrors the host plugin's):
		*  - The form reads/writes ONLY this plugin's own profile entry through the
		*    shared `configForms` service (`get(entryId)` + the form's `set`) — the
		*    same settings transport the stock Shell page uses. There is no second,
		*    bypass write path, and no direct `remote.settings` access.
		*  - The authoritative guard (safe roots, usable command entries, refuse
		*    before persist) runs host-side in dsh-whitelist-sandbox when the change is
		*    applied; the UI shows the document value and a notice that final
		*    application is subject to it.
		*  - Nothing model-controlled is ever rendered into this form; inputs are
		*    operator-typed paths and command prefixes only.
		*/
		/**
		* One editable string list with its own draft/pending/save state. Both lists
		* write through the same shared form; each keeps its own unsaved edits so
		* editing one never discards the other's draft.
		*/
		function ListEditor(props) {
			const { items, editable, onSave } = props;
			const [draft, setDraft] = (0, react.useState)("");
			const [pending, setPending] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)(null);
			const values = pending === null ? [...items] : pending;
			const dirty = pending !== null;
			const mark = (next) => {
				setPending(next);
				setNotice(null);
			};
			const add = () => {
				const value = draft.trim();
				if (value === "") return;
				mark([...values, value]);
				setDraft("");
			};
			const remove = (index) => {
				mark(values.filter((_, cursor) => cursor !== index));
			};
			const save = async () => {
				setSaving(true);
				try {
					const result = await onSave(values);
					if (result.ok) {
						setPending(null);
						setNotice({
							ok: true,
							message: props.savedLabel
						});
					} else setNotice({
						ok: false,
						message: props.saveFailedLabel + result.error
					});
				} finally {
					setSaving(false);
				}
			};
			const valueText = {
				minWidth: "0",
				overflowWrap: "anywhere",
				fontFamily: "var(--ds-font-family-code)",
				fontSize: "12px",
				lineHeight: "16px"
			};
			const row = (index, value) => (0, react_jsx_runtime.jsx)("li", {
				key: index,
				style: {
					display: "flex",
					alignItems: "center",
					gap: "4px",
					minHeight: "24px"
				},
				children: [(0, react_jsx_runtime.jsx)("span", {
					style: {
						...valueText,
						flex: "1"
					},
					children: value
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					size: "sm",
					icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutlineRegular, {}),
					style: {
						flex: "none",
						width: "24px",
						height: "24px",
						padding: 0
					},
					"aria-label": props.removeLabel,
					onClick: () => remove(index)
				})]
			});
			const chip = (index, value) => (0, react_jsx_runtime.jsx)("li", {
				key: index,
				style: {
					display: "inline-flex",
					alignItems: "center",
					gap: "2px",
					minWidth: "0",
					maxWidth: "100%",
					padding: "0 0 0 10px",
					borderRadius: "999px",
					background: "var(--dsw-alias-bg-module-platform)"
				},
				children: [(0, react_jsx_runtime.jsx)("span", {
					style: valueText,
					children: value
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					size: "sm",
					icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutlineRegular, { size: 14 }),
					style: {
						flex: "none",
						width: "24px",
						height: "24px",
						padding: 0,
						borderRadius: "999px"
					},
					"aria-label": props.removeLabel,
					onClick: () => remove(index)
				})]
			});
			return (0, react_jsx_runtime.jsxs)("section", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: "6px"
				},
				children: [
					(0, react_jsx_runtime.jsx)("h3", {
						style: {
							margin: 0,
							fontSize: "13px",
							lineHeight: "18px"
						},
						children: props.title
					}),
					(0, react_jsx_runtime.jsx)("p", {
						style: {
							margin: 0,
							color: "var(--dsw-alias-label-secondary)",
							fontSize: "12px",
							lineHeight: "18px"
						},
						children: props.hint
					}),
					values.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
						style: {
							margin: 0,
							color: "var(--dsw-alias-label-tertiary)",
							fontSize: "12px"
						},
						children: props.emptyLabel
					}) : props.layout === "chips" ? (0, react_jsx_runtime.jsx)("ul", {
						role: "list",
						style: {
							listStyle: "none",
							margin: 0,
							padding: 0,
							display: "flex",
							flexWrap: "wrap",
							alignItems: "center",
							gap: "6px"
						},
						children: values.map((value, index) => chip(index, value))
					}) : (0, react_jsx_runtime.jsx)("ul", {
						role: "list",
						style: {
							listStyle: "none",
							margin: 0,
							padding: 0
						},
						children: values.map((value, index) => row(index, value))
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: "6px",
							alignItems: "center"
						},
						children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							style: { flex: "1" },
							value: draft,
							placeholder: props.placeholder,
							disabled: !editable,
							onChange: (event) => setDraft(event.target.value),
							onKeyDown: (event) => {
								if (event.key === "Enter") add();
							}
						}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							size: "sm",
							icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutlineRegular, {}),
							disabled: !editable || draft.trim() === "",
							onClick: add,
							children: props.addLabel
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
								children: props.saveLabel
							}),
							dirty && (0, react_jsx_runtime.jsx)("span", {
								style: {
									color: "var(--dsw-alias-label-tertiary)",
									fontSize: "12px"
								},
								children: props.unsavedLabel
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
					})
				]
			});
		}
		/** The settings-page section: edit both whitelists, save each through the document. */
		function WhitelistSection({ controller, t }) {
			const state = (0, react.useSyncExternalStore)((listener) => controller.subscribe(listener), () => controller.getSnapshot());
			const common = {
				editable: state.writable && state.status === "ready",
				addLabel: t("add"),
				removeLabel: t("remove"),
				saveLabel: t("save"),
				unsavedLabel: t("unsaved"),
				savedLabel: t("saved"),
				saveFailedLabel: t("saveFailed"),
				emptyLabel: t("empty")
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: "14px",
					maxWidth: "720px"
				},
				children: [
					(0, react_jsx_runtime.jsx)("p", {
						style: {
							margin: 0,
							color: "var(--dsw-alias-label-secondary)",
							fontSize: "12px",
							lineHeight: "18px"
						},
						children: t("hint")
					}),
					state.status === "loading" && (0, react_jsx_runtime.jsx)("p", { children: t("loading") }),
					state.status === "unavailable" && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: t("notLoaded")
					}),
					(0, react_jsx_runtime.jsx)(ListEditor, {
						...common,
						title: t("rootsTitle"),
						hint: t("rootsHint"),
						items: state.roots,
						placeholder: t("addPlaceholder"),
						onSave: (values) => controller.saveRoots(values)
					}),
					(0, react_jsx_runtime.jsx)(ListEditor, {
						...common,
						title: t("commandsTitle"),
						hint: t("commandsHint"),
						layout: "chips",
						items: state.commands,
						placeholder: t("commandAddPlaceholder"),
						onSave: (values) => controller.saveCommands(values)
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
		* Required client services. `configForms` (provided by
		* `@deepseek-ai/dsh-client-ui-settings`) owns the settings mirror and the write
		* transport, so this bundle no longer injects `remote` / `remote.settings`.
		*/
		const inject = [
			"slots",
			"locale",
			"configForms"
		];
		/**
		* Publish the whitelist section into the settings nav while the Host serves
		* this plugin's entry, and bind it to that entry's shared configuration form.
		* The form already derives from the settings mirror, so there is no separate
		* refresh-on-invalidation wiring: its own subscription drives re-renders.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(COPY_NS, {
				zh,
				en
			}), "dsh-whitelist-sandbox: dictionaries");
			const t = ctx.locale.bind(COPY_NS);
			const controller = new WhitelistSettingsStore(ctx.configForms.get(SETTINGS_NS));
			ctx.effect(() => ctx.configForms.whileServed([SETTINGS_NS], () => ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "whitelist",
				order: 20,
				label: () => t("nav"),
				inject: () => ({
					controller,
					t
				})
			}, WhitelistSection))), "dsh-whitelist-sandbox: settings page");
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