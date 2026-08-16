window.__ModuleLoader__.load({
	id: "dsh-rollback-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/client/locales.js
		const NS = "rollback";
		const zh = {
			"action": "回滚到此回复之前",
			"title": "回滚预览",
			"loading": "正在生成预览…",
			"snapshot": "快照点",
			"targetTurn": "目标轮次",
			"degraded": "快照早于目标轮（degraded）",
			"changes": "文件变更",
			"modifications": "工具修改",
			"file": "文件",
			"modification": "修改",
			"status.modified": "已修改",
			"status.deleted": "已删除",
			"status.created": "新建",
			"status.typechange": "类型变更",
			"status.ignored": "ignored",
			"status.binary": "二进制",
			"status.nested-repo": "嵌套仓库",
			"wholeTurn": "整体回滚（含会话分支）",
			"selectedFiles": "仅恢复选中文件",
			"selectedModifications": "仅撤销选中修改",
			"createdPolicy.keep": "保留新建文件",
			"createdPolicy.delete": "删除本轮新建文件",
			"deleteCreated": "删除新建文件",
			"confirm": "确认回滚",
			"cancel": "取消",
			"turn1NoFork": "turn 1 无上一轮结束点，整体回滚不会分支会话。",
			"merge": "可合并撤销",
			"fileOnly": "仅支持整文件恢复",
			"unsupported": "不支持单修改恢复",
			"conflictRisk": "该文件后续还有修改，合并可能冲突。",
			"success": "回滚完成",
			"failed": "回滚失败",
			"empty": "本轮没有可回滚的变更。",
			"openAt": "在编辑器中打开",
			"workspaceChanged": "工作区已变化，请重新生成预览。",
			"bridgeUnavailable": "VS Code 打开桥不可用。"
		};
		const en = {
			"action": "Roll back before this reply",
			"title": "Rollback preview",
			"loading": "Preparing preview…",
			"snapshot": "Snapshot",
			"targetTurn": "Target turn",
			"degraded": "Snapshot predates the target turn (degraded)",
			"changes": "File changes",
			"modifications": "Tool modifications",
			"file": "File",
			"modification": "Modification",
			"status.modified": "Modified",
			"status.deleted": "Deleted",
			"status.created": "Created",
			"status.typechange": "Type change",
			"status.ignored": "Ignored",
			"status.binary": "Binary",
			"status.nested-repo": "Nested repo",
			"wholeTurn": "Whole turn (with session fork)",
			"selectedFiles": "Restore selected files only",
			"selectedModifications": "Undo selected modifications only",
			"createdPolicy.keep": "Keep created files",
			"createdPolicy.delete": "Delete files created this turn",
			"deleteCreated": "Delete created files",
			"confirm": "Confirm rollback",
			"cancel": "Cancel",
			"turn1NoFork": "Turn 1 has no previous turn end; whole-turn rollback will not fork the session.",
			"merge": "Mergeable undo",
			"fileOnly": "Whole-file restore only",
			"unsupported": "Single-modification restore unsupported",
			"conflictRisk": "This file has later modifications; the merge may conflict.",
			"success": "Rollback complete",
			"failed": "Rollback failed",
			"empty": "No restorable changes in this turn.",
			"openAt": "Open in editor",
			"workspaceChanged": "Workspace changed; please prepare the preview again.",
			"bridgeUnavailable": "VS Code open bridge is unavailable."
		};
		//#endregion
		//#region lib/types/shared/json-codec.js
		/**
		* Strict JSON codec used by the hand-written rollback Remote contribution.
		*
		* `dsh-api-gateway` requires every generated Remote parameter and result to
		* carry a `strict` codec; the Host boundary additionally re-validates that
		* the decoded value is JSON-safe. Business validation stays in the service
		* methods, so this codec intentionally performs the identity transform.
		*/
		function jsonCodec(typeSymbol) {
			return {
				mode: "strict",
				typeSymbol,
				schema: { parse(value) {
					return value;
				} }
			};
		}
		//#endregion
		//#region lib/types/client/remote.js
		const packageName = "dsh-rollback-plugin";
		function parameter(name) {
			return {
				name,
				wire: name,
				source: "json",
				codec: jsonCodec("dsh-rollback-plugin#JsonValue")
			};
		}
		/** Consumer-side contribution; mirrors the Host descriptors in ../host/typert.ts. */
		const ROLLBACK_REMOTE = {
			package: packageName,
			descriptors: [
				{
					id: `${packageName}#rollback/prepare`,
					service: "rollback",
					namespace: "rollback",
					method: "prepare",
					invocation: { kind: "direct" },
					parameters: [parameter("sessionId"), parameter("messageId")],
					cancellation: { parameter: "signal" },
					result: jsonCodec("dsh-rollback-plugin#RemoteResult")
				},
				{
					id: `${packageName}#rollback/execute`,
					service: "rollback",
					namespace: "rollback",
					method: "execute",
					invocation: { kind: "direct" },
					parameters: [parameter("request")],
					cancellation: { parameter: "signal" },
					result: jsonCodec("dsh-rollback-plugin#RemoteResult")
				},
				{
					id: `${packageName}#rollback/openAt`,
					service: "rollback",
					namespace: "rollback",
					method: "openAt",
					invocation: { kind: "direct" },
					parameters: [
						parameter("sessionId"),
						parameter("path"),
						parameter("line")
					],
					cancellation: { parameter: "signal" },
					result: jsonCodec("dsh-rollback-plugin#RemoteResult")
				},
				{
					id: `${packageName}#rollback/status`,
					service: "rollback",
					namespace: "rollback",
					method: "status",
					invocation: { kind: "direct" },
					parameters: [parameter("sessionId")],
					cancellation: { parameter: "signal" },
					result: jsonCodec("dsh-rollback-plugin#RemoteResult")
				}
			]
		};
		//#endregion
		//#region lib/types/client/RollbackAction.js
		function isRemoteOk(value) {
			return value.ok;
		}
		function RollbackAction(props) {
			const { messageId, prepare, execute, openAt, forkAt, t } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const [loading, setLoading] = (0, react.useState)(false);
			const [data, setData] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [scope, setScope] = (0, react.useState)("turn");
			const [paths, setPaths] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [modificationIds, setModificationIds] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [createdPolicy, setCreatedPolicy] = (0, react.useState)("keep");
			const [result, setResult] = (0, react.useState)(null);
			const [resultError, setResultError] = (0, react.useState)(null);
			const runPrepare = async () => {
				setOpen(true);
				setLoading(true);
				setError(null);
				setResult(null);
				setResultError(null);
				let remote;
				try {
					remote = await prepare(messageId);
				} catch (prepareError) {
					setError(prepareError instanceof Error ? prepareError.message : String(prepareError));
					setLoading(false);
					return;
				}
				if (!isRemoteOk(remote)) {
					setError(remote.error.message);
					setLoading(false);
					return;
				}
				const business = remote.value;
				if (!business.ok) {
					setError(business.error.message);
					setLoading(false);
					return;
				}
				const loaded = business.value;
				setData(loaded);
				setScope("turn");
				setPaths(new Set(loaded.changes.filter((change) => change.restorable).map((change) => change.path)));
				setModificationIds(new Set(loaded.modifications.filter((item) => item.restorable === "merge").map((item) => item.modificationId)));
				setLoading(false);
			};
			const runExecute = async () => {
				if (data === null) return;
				setResult(null);
				setResultError(null);
				const base = {
					confirmed: true,
					createdPolicy,
					prepareId: data.prepareId
				};
				const remote = await execute(messageId, scope === "turn" ? {
					...base,
					scope: "turn"
				} : scope === "files" ? {
					...base,
					scope: "files",
					paths: [...paths]
				} : {
					...base,
					scope: "modifications",
					modificationIds: [...modificationIds]
				}).catch((executeError) => {
					setResultError(executeError instanceof Error ? executeError.message : String(executeError));
					return null;
				});
				if (remote === null) return;
				if (!isRemoteOk(remote)) {
					setResultError(remote.error.message);
					return;
				}
				const business = remote.value;
				if (!business.ok) {
					setResultError(business.error.message);
					return;
				}
				const value = business.value;
				setResult(value);
				if (scope === "turn" && value.forkAnchor !== void 0) try {
					await forkAt(value.forkAnchor);
				} catch (forkError) {
					setResultError(`${String(forkError)} (files were restored; guardId ${value.guardId})`);
				}
			};
			const togglePath = (path) => {
				const next = new Set(paths);
				if (next.has(path)) next.delete(path);
				else next.add(path);
				setPaths(next);
			};
			const toggleModification = (id) => {
				const next = new Set(modificationIds);
				if (next.has(id)) next.delete(id);
				else next.add(id);
				setModificationIds(next);
			};
			const fileRows = (0, react.useMemo)(() => {
				const changes = data?.changes ?? [];
				const mods = data?.modifications ?? [];
				return changes.map((change) => (0, react_jsx_runtime.jsx)(FileRow, {
					change,
					selected: paths.has(change.path),
					onToggle: () => {
						togglePath(change.path);
					},
					onOpen: (line) => {
						openAt(change.path, line).then(() => void 0);
					},
					t,
					modifications: mods.filter((item) => item.path === change.path),
					selectedModifications: modificationIds,
					onToggleModification: toggleModification,
					modificationScope: scope === "modifications"
				}, change.path));
			}, [
				data,
				paths,
				modificationIds,
				scope,
				t
			]);
			return (0, react_jsx_runtime.jsxs)("span", {
				style: {
					display: "inline-flex",
					alignItems: "center"
				},
				children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: t("action"),
					side: "bottom",
					children: (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-rollback-action",
						"aria-label": t("action"),
						onClick: () => {
							runPrepare();
						},
						children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, {})
					})
				}), open ? (0, react_jsx_runtime.jsx)("div", {
					style: {
						position: "fixed",
						inset: 0,
						background: "rgba(0,0,0,.35)",
						zIndex: 1e3,
						display: "flex",
						alignItems: "center",
						justifyContent: "center"
					},
					onClick: () => {
						setOpen(false);
					},
					children: (0, react_jsx_runtime.jsxs)("div", {
						style: {
							background: "var(--dsw-color-bg, #fff)",
							color: "var(--dsw-color-text, #111)",
							borderRadius: 12,
							padding: 16,
							maxWidth: 780,
							width: "min(92vw, 780px)",
							maxHeight: "82vh",
							overflow: "auto"
						},
						onClick: (event) => {
							event.stopPropagation();
						},
						children: [
							(0, react_jsx_runtime.jsx)("h3", {
								style: { marginTop: 0 },
								children: t("title")
							}),
							loading ? (0, react_jsx_runtime.jsx)("div", { children: t("loading") }) : null,
							error !== null ? (0, react_jsx_runtime.jsxs)("div", { children: [
								t("failed"),
								": ",
								error
							] }) : null,
							data !== null ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								(0, react_jsx_runtime.jsxs)("div", { children: [
									t("snapshot"),
									": turn ",
									data.snapshot.turn,
									" · ",
									new Date(data.snapshot.createdAt).toLocaleString(),
									data.snapshot.degraded === true ? ` · ${t("degraded")}` : ""
								] }),
								(0, react_jsx_runtime.jsxs)("div", { children: [
									t("targetTurn"),
									": ",
									data.boundary.targetTurn,
									data.boundary.forkAvailable === false ? ` · ${t("turn1NoFork")}` : ""
								] }),
								(0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										gap: 12,
										margin: "10px 0"
									},
									children: [
										(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("input", {
											type: "radio",
											checked: scope === "turn",
											onChange: () => {
												setScope("turn");
											}
										}), t("wholeTurn")] }),
										(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("input", {
											type: "radio",
											checked: scope === "files",
											onChange: () => {
												setScope("files");
											}
										}), t("selectedFiles")] }),
										(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("input", {
											type: "radio",
											checked: scope === "modifications",
											onChange: () => {
												setScope("modifications");
											}
										}), t("selectedModifications")] })
									]
								}),
								(0, react_jsx_runtime.jsxs)("label", {
									style: {
										display: "block",
										marginBottom: 8
									},
									children: [(0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: createdPolicy === "delete",
										onChange: (event) => {
											setCreatedPolicy(event.target.checked ? "delete" : "keep");
										}
									}), t("createdPolicy.delete")]
								}),
								(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("h4", { children: t("changes") }), fileRows.length === 0 ? (0, react_jsx_runtime.jsx)("div", { children: t("empty") }) : fileRows] }),
								data.warnings.length > 0 ? (0, react_jsx_runtime.jsx)("div", {
									style: {
										marginTop: 8,
										opacity: .8
									},
									children: data.warnings.join(" · ")
								}) : null,
								result !== null ? (0, react_jsx_runtime.jsxs)("div", {
									style: { marginTop: 8 },
									children: [
										t("success"),
										": ",
										result.restored.length,
										" restored, ",
										result.kept.length,
										" kept, ",
										result.deleted.length,
										" deleted"
									]
								}) : null,
								resultError !== null ? (0, react_jsx_runtime.jsxs)("div", {
									style: { marginTop: 8 },
									children: [
										t("failed"),
										": ",
										resultError
									]
								}) : null,
								(0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										gap: 8,
										justifyContent: "flex-end",
										marginTop: 12
									},
									children: [(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => {
											setOpen(false);
										},
										children: t("cancel")
									}), (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => {
											runExecute();
										},
										children: t("confirm")
									})]
								})
							] }) : null
						]
					})
				}) : null]
			});
		}
		function FileRow(props) {
			const { change, selected, onToggle, onOpen, t, modifications, selectedModifications, onToggleModification, modificationScope } = props;
			return (0, react_jsx_runtime.jsxs)("div", {
				style: {
					margin: "6px 0",
					padding: 6,
					border: "1px solid rgba(128,128,128,.25)",
					borderRadius: 8
				},
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8
						},
						children: [
							change.restorable ? (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: selected,
								onChange: onToggle
							}) : null,
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: {
									textDecoration: "underline",
									background: "none",
									border: 0,
									padding: 0,
									cursor: "pointer"
								},
								onClick: () => {
									onOpen(change.hunks?.[0]?.newLine);
								},
								children: change.path
							}),
							(0, react_jsx_runtime.jsx)("span", {
								style: { opacity: .75 },
								children: t(`status.${change.status}`)
							}),
							change.createdAfterSnapshot === true ? (0, react_jsx_runtime.jsx)("span", { children: t("status.created") }) : null
						]
					}),
					modificationScope && modifications.length > 0 ? (0, react_jsx_runtime.jsx)("div", {
						style: { marginLeft: 20 },
						children: modifications.map((item) => (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8,
								alignItems: "center"
							},
							children: [
								(0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: selectedModifications.has(item.modificationId),
									onChange: () => {
										onToggleModification(item.modificationId);
									}
								}),
								(0, react_jsx_runtime.jsxs)("span", { children: [
									item.toolName,
									" #",
									item.modificationId
								] }),
								(0, react_jsx_runtime.jsx)("span", {
									style: { opacity: .75 },
									children: item.restorable === "merge" ? t("merge") : item.restorable === "file-only" ? t("fileOnly") : t("unsupported")
								}),
								item.laterModificationIds !== void 0 && item.laterModificationIds.length > 0 ? (0, react_jsx_runtime.jsx)("span", {
									style: { color: "#b8860b" },
									children: t("conflictRisk")
								}) : null,
								item.reason !== void 0 ? (0, react_jsx_runtime.jsx)("span", {
									style: { opacity: .7 },
									children: item.reason
								}) : null
							]
						}, item.modificationId))
					}) : null,
					change.hunks !== void 0 && change.hunks.length > 0 ? (0, react_jsx_runtime.jsx)("pre", {
						style: {
							margin: "6px 0 0",
							fontSize: 11,
							maxHeight: 160,
							overflow: "auto",
							background: "rgba(0,0,0,.04)",
							padding: 6
						},
						children: change.hunks.map((hunk, index) => `${hunk.oldText ?? ""}\n${hunk.newText}`).join(`\n---\n`)
					}) : null
				]
			});
		}
		//#endregion
		//#region lib/types/client/index.js
		const inject = [
			"slots",
			"remote",
			"remote.rollback",
			"locale",
			"sessions",
			"workspaces"
		];
		/**
		* Mirrors the native chat message action button (28×28 hit area, borderless,
		* 16px icon, hover background) so the rollback entry blends into the action row.
		*/
		const ACTION_CSS = ".dsh-rollback-action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:transparent;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}.dsh-rollback-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}";
		async function apply(ctx) {
			const tagId = "dsh-rollback-plugin/action";
			if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-rollback-plugin";
				tag.dataset.pluginCss = tagId;
				tag.textContent = ACTION_CSS;
				document.head.appendChild(tag);
			}
			const sessions = ctx.sessions;
			const unmountRemote = await ctx.remote.$mount(ROLLBACK_REMOTE);
			ctx.effect(() => () => {
				unmountRemote();
			}, "rollback remote teardown");
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "rollback dictionaries");
			ctx.slots.inject("conversation.chat.assistant-actions", () => {
				return ctx.slots.register({
					name: "conversation.chat.assistant-actions",
					id: "rollback",
					order: 20,
					locale: NS,
					inject: (sessionId) => ({
						prepare: (messageId) => ctx.remote.rollback.prepare(sessionId, messageId),
						execute: (messageId, request) => ctx.remote.rollback.execute({
							sessionId,
							messageId,
							...request
						}),
						openAt: (path, line) => ctx.remote.rollback.openAt(sessionId, path, line),
						forkAt: async (seq) => {
							const childId = await sessions.fork({
								sessionId,
								atSeq: seq,
								increaseTitle: true
							});
							sessions.open(childId);
							return childId;
						}
					})
				}, RollbackAction);
			});
			return async () => {
				await unmountRemote();
			};
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map