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
			"openInEditor": "在 VS Code 编辑器中查看修改",
			"workspaceChanged": "工作区已变化，请重新生成预览。",
			"bridgeUnavailable": "VS Code 打开桥不可用。",
			"dock.title": "修改列表",
			"dock.refresh": "刷新修改列表",
			"dock.empty": "本次会话没有未接受的修改。",
			"dock.modificationsOnly": "有工具修改记录，但没有可映射的文件变更；请刷新列表或重新执行修改。",
			"dock.accepted": "已接受",
			"dock.showAccepted": "显示已接受",
			"dock.hideAccepted": "隐藏已接受",
			"dock.accept": "接受此修改",
			"dock.acceptAll": "全部接受",
			"dock.undo": "撤销此修改",
			"dock.undoAll": "全部撤销",
			"dock.undoing": "撤销中…",
			"dock.baseline": "基线：第 {turn} 轮",
			"dock.patches": "{count} 个补丁",
			"dock.stale": "修改列表已过期，请刷新后重试。",
			"dock.fileRestoreHint": "撤销整文件将恢复到会话基线（第 {turn} 轮快照）。",
			"dock.updated": "修改列表已更新。"
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
			"openInEditor": "Review modifications in VS Code editor",
			"workspaceChanged": "Workspace changed; please prepare the preview again.",
			"bridgeUnavailable": "VS Code open bridge is unavailable.",
			"dock.title": "Modifications",
			"dock.refresh": "Refresh the modification list",
			"dock.empty": "No unaccepted modifications in this session.",
			"dock.modificationsOnly": "Tool modifications were recorded but no file change could be mapped; refresh the list or re-run the modification.",
			"dock.accepted": "Accepted",
			"dock.showAccepted": "Show accepted",
			"dock.hideAccepted": "Hide accepted",
			"dock.accept": "Accept this modification",
			"dock.acceptAll": "Accept all",
			"dock.undo": "Undo this modification",
			"dock.undoAll": "Undo all",
			"dock.undoing": "Undoing…",
			"dock.baseline": "Baseline: turn {turn}",
			"dock.patches": "{count} patches",
			"dock.stale": "The modification list is stale; refresh and try again.",
			"dock.fileRestoreHint": "Undoing a file restores the session baseline (turn {turn} snapshot).",
			"dock.updated": "Modification list updated."
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
				},
				{
					id: `${packageName}#rollback/prepareTurn`,
					service: "rollback",
					namespace: "rollback",
					method: "prepareTurn",
					invocation: { kind: "direct" },
					parameters: [parameter("sessionId"), parameter("turn")],
					cancellation: { parameter: "signal" },
					result: jsonCodec("dsh-rollback-plugin#RemoteResult")
				},
				{
					id: `${packageName}#rollback/acceptAll`,
					service: "rollback",
					namespace: "rollback",
					method: "acceptAll",
					invocation: { kind: "direct" },
					parameters: [parameter("request")],
					cancellation: { parameter: "signal" },
					result: jsonCodec("dsh-rollback-plugin#RemoteResult")
				},
				{
					id: `${packageName}#rollback/undoAll`,
					service: "rollback",
					namespace: "rollback",
					method: "undoAll",
					invocation: { kind: "direct" },
					parameters: [parameter("request")],
					cancellation: { parameter: "signal" },
					result: jsonCodec("dsh-rollback-plugin#RemoteResult")
				},
				{
					id: `${packageName}#rollback/sessionChanges`,
					service: "rollback",
					namespace: "rollback",
					method: "sessionChanges",
					invocation: { kind: "direct" },
					parameters: [parameter("sessionId")],
					cancellation: { parameter: "signal" },
					result: jsonCodec("dsh-rollback-plugin#RemoteResult")
				},
				{
					id: `${packageName}#rollback/acceptFile`,
					service: "rollback",
					namespace: "rollback",
					method: "acceptFile",
					invocation: { kind: "direct" },
					parameters: [parameter("request")],
					cancellation: { parameter: "signal" },
					result: jsonCodec("dsh-rollback-plugin#RemoteResult")
				},
				{
					id: `${packageName}#rollback/acceptModification`,
					service: "rollback",
					namespace: "rollback",
					method: "acceptModification",
					invocation: { kind: "direct" },
					parameters: [parameter("request")],
					cancellation: { parameter: "signal" },
					result: jsonCodec("dsh-rollback-plugin#RemoteResult")
				},
				{
					id: `${packageName}#rollback/undoFile`,
					service: "rollback",
					namespace: "rollback",
					method: "undoFile",
					invocation: { kind: "direct" },
					parameters: [parameter("request")],
					cancellation: { parameter: "signal" },
					result: jsonCodec("dsh-rollback-plugin#RemoteResult")
				},
				{
					id: `${packageName}#rollback/undoModification`,
					service: "rollback",
					namespace: "rollback",
					method: "undoModification",
					invocation: { kind: "direct" },
					parameters: [parameter("request")],
					cancellation: { parameter: "signal" },
					result: jsonCodec("dsh-rollback-plugin#RemoteResult")
				}
			]
		};
		//#endregion
		//#region lib/types/client/icons.js
		/**
		* Undo icon (distinct from the circular refresh arrow used by the refresh
		* button). Same conventions as the `Icon*Outline14` family in
		* `@deepseek-ai/dsh-client-ui-primitives`: inline SVG, single color inherited
		* via `currentColor`, square viewBox scaled to `size`.
		*
		* The same 24×24 path is exposed in two crops:
		* - `IconUndoOutline14` renders the full glyph (viewBox 0 0 24 24) — right
		*   weight for the 14px sidebar dock buttons.
		* - `IconUndoOutline16` crops to the glyph core (viewBox 4 4 16 16) — the
		*   enlarged version used by the 16px message-action button.
		*
		* To swap in an icon found elsewhere, replace the `d` value below with the
		* target SVG's `<path d="...">` (keep `fill`-based single-color icons for
		* visual consistency; stroke-based icons need `stroke="currentColor"` +
		* `strokeWidth` instead).
		*/
		const UNDO_PATH = "M7.53033 3.46967C7.82322 3.76256 7.82322 4.23744 7.53033 4.53033L5.81066 6.25H15C18.1756 6.25 20.75 8.82436 20.75 12C20.75 15.1756 18.1756 17.75 15 17.75H8.00001C7.58579 17.75 7.25001 17.4142 7.25001 17C7.25001 16.5858 7.58579 16.25 8.00001 16.25H15C17.3472 16.25 19.25 14.3472 19.25 12C19.25 9.65279 17.3472 7.75 15 7.75H5.81066L7.53033 9.46967C7.82322 9.76256 7.82322 10.2374 7.53033 10.5303C7.23744 10.8232 6.76256 10.8232 6.46967 10.5303L3.46967 7.53033C3.17678 7.23744 3.17678 6.76256 3.46967 6.46967L6.46967 3.46967C6.76256 3.17678 7.23744 3.17678 7.53033 3.46967Z";
		function UndoIcon(props) {
			const { size, viewBox, className } = props;
			return (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				className,
				viewBox,
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				children: (0, react_jsx_runtime.jsx)("path", {
					d: UNDO_PATH,
					fill: "currentColor"
				})
			});
		}
		/** Full 24×24 glyph, rendered at 14px — sidebar dock undo buttons. */
		function IconUndoOutline14({ size = 14, className }) {
			return (0, react_jsx_runtime.jsx)(UndoIcon, {
				size,
				viewBox: "0 0 24 24",
				className
			});
		}
		/** Cropped glyph core (viewBox 4 4 16 16), rendered at 16px — message rollback action button. */
		function IconUndoOutline16({ size = 16, className }) {
			return (0, react_jsx_runtime.jsx)(UndoIcon, {
				size,
				viewBox: "4 4 16 16",
				className
			});
		}
		//#endregion
		//#region lib/types/client/ModificationDock.js
		function unwrapRemote(remote) {
			if (!remote.ok) return remote.error.message;
			const business = remote.value;
			if (!business.ok) return business.error.message;
			return business.value;
		}
		function ModificationDock(props) {
			const { session, t, sessionChanges, acceptAll, undoAll, acceptFile, acceptModification, undoFile, undoModification, openAt } = props;
			const [data, setData] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [collapsed, setCollapsed] = (0, react.useState)(false);
			const [showAccepted, setShowAccepted] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [confirming, setConfirming] = (0, react.useState)(null);
			const [confirmingAll, setConfirmingAll] = (0, react.useState)(false);
			const [actionError, setActionError] = (0, react.useState)(null);
			const dataRef = (0, react.useRef)(null);
			dataRef.current = data;
			const loadingRef = (0, react.useRef)(false);
			const queuedRef = (0, react.useRef)(false);
			const load = async () => {
				if (loadingRef.current) {
					queuedRef.current = true;
					return;
				}
				loadingRef.current = true;
				setLoading(true);
				try {
					const remote = await sessionChanges().catch((loadError) => {
						setError(loadError instanceof Error ? loadError.message : String(loadError));
						return null;
					});
					if (remote === null) return;
					const value = unwrapRemote(remote);
					if (typeof value === "string") {
						setError(value);
						return;
					}
					setData(value);
					setError(null);
					setActionError(null);
				} finally {
					loadingRef.current = false;
					setLoading(false);
					if (queuedRef.current) {
						queuedRef.current = false;
						load();
					}
				}
			};
			const mounted = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				const timer = setTimeout(() => {
					load();
				}, mounted.current ? 300 : 0);
				mounted.current = true;
				return () => clearTimeout(timer);
			}, [session]);
			const changes = data?.changes ?? [];
			const unaccepted = changes.filter((change) => change.accepted !== true);
			const acceptedFiles = changes.filter((change) => change.accepted === true);
			const markBusy = (key) => {
				setBusy((prev) => new Set(prev).add(key));
			};
			const unmarkBusy = (key) => {
				setBusy((prev) => {
					const next = new Set(prev);
					next.delete(key);
					return next;
				});
			};
			const runMutation = async (key, call) => {
				markBusy(key);
				setActionError(null);
				try {
					const remote = await call().catch((mutationError) => {
						setActionError(mutationError instanceof Error ? mutationError.message : String(mutationError));
						return null;
					});
					if (remote === null) return false;
					if (!remote.ok) {
						setActionError(remote.error.message);
						return false;
					}
					const business = remote.value;
					if (!business.ok) {
						setActionError(business.error.message);
						if ("code" in business.error && business.error.code === "workspace-changed") load();
						return false;
					}
					return true;
				} finally {
					unmarkBusy(key);
				}
			};
			const runAcceptFile = async (change) => {
				const current = dataRef.current;
				if (current === null) return;
				if (await runMutation(`file:${change.path}`, () => acceptFile(change.path, current.listId))) load();
			};
			const runUndoFile = async (change) => {
				setConfirming(null);
				const current = dataRef.current;
				if (current === null) return;
				if (await runMutation(`file:${change.path}`, () => undoFile(change.path, current.listId))) load();
			};
			const runAcceptAll = async () => {
				const current = dataRef.current;
				if (current === null) return;
				if (await runMutation("all", () => acceptAll(current.listId))) load();
			};
			const runUndoAll = async () => {
				setConfirmingAll(false);
				const current = dataRef.current;
				if (current === null) return;
				if (await runMutation("all", () => undoAll(current.listId))) load();
			};
			const openFile = (change) => {
				const firstHunk = change.hunks?.[0] ?? change.toolCalls?.[0]?.hunks?.[0];
				openAt(change.path, firstHunk?.firstChangedNewLine ?? firstHunk?.newLine).then(() => void 0);
			};
			const openReview = (path) => {
				const current = dataRef.current;
				if (current === null) return;
				const change = current.changes.find((item) => item.path === path);
				const payload = {
					type: "dshui:reviewModifications",
					sessionId: props.sessionId,
					listId: current.listId,
					path,
					...change === void 0 ? {} : { change }
				};
				if (typeof window !== "undefined" && window.parent !== window) {
					window.parent.postMessage(payload, "*");
					return;
				}
				if (change !== void 0) openFile(change);
			};
			const loadRef = (0, react.useRef)(() => {});
			loadRef.current = () => {
				load();
			};
			(0, react.useEffect)(() => {
				const onMessage = (event) => {
					const data = event.data;
					if (data !== null && typeof data === "object" && data.type === "dshui:modificationsChanged") loadRef.current();
				};
				window.addEventListener("message", onMessage);
				return () => {
					window.removeEventListener("message", onMessage);
				};
			}, []);
			if (data !== null && changes.length === 0) return null;
			if (data === null && error === null) return null;
			const allBusy = busy.has("all");
			return (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-mod-dock",
				children: (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-mod-panel",
					children: [(0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-mod-header",
						children: [(0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "dsh-mod-toggle",
							onClick: () => {
								setCollapsed((value) => !value);
							},
							"aria-expanded": !collapsed,
							children: [
								(0, react_jsx_runtime.jsx)("span", {
									className: "dsh-mod-lead",
									children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChecklistOutline14, {})
								}),
								(0, react_jsx_runtime.jsxs)("span", {
									className: "dsh-mod-count",
									children: [t("dock.title"), loading ? (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-mod-loading",
										children: "…"
									}) : ` · ${unaccepted.length}`]
								}),
								acceptedFiles.length > 0 ? (0, react_jsx_runtime.jsxs)("span", {
									className: "dsh-mod-accepted-chip",
									children: [
										t("dock.accepted"),
										" ",
										acceptedFiles.length
									]
								}) : null,
								(0, react_jsx_runtime.jsx)("span", {
									className: "dsh-mod-chevron",
									children: collapsed ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronUpOutline14, {}) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {})
								})
							]
						}), (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-mod-header-actions",
							children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("dock.acceptAll"),
								side: "bottom",
								children: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-mod-action",
									onClick: () => {
										runAcceptAll();
									},
									disabled: allBusy || unaccepted.length === 0,
									"aria-label": t("dock.acceptAll"),
									children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline14, {})
								})
							}), confirmingAll ? (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-mod-confirm",
								children: [(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-mod-confirm-yes",
									onClick: () => {
										runUndoAll();
									},
									disabled: allBusy,
									children: t("confirm")
								}), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-mod-confirm-no",
									onClick: () => {
										setConfirmingAll(false);
									},
									children: t("cancel")
								})]
							}) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("dock.undoAll"),
								side: "bottom",
								children: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-mod-action",
									onClick: () => {
										setConfirmingAll(true);
									},
									disabled: allBusy || unaccepted.length === 0,
									"aria-label": t("dock.undoAll"),
									children: allBusy ? (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-mod-spin",
										children: "◌"
									}) : (0, react_jsx_runtime.jsx)(IconUndoOutline14, {})
								})
							})]
						})]
					}), collapsed ? null : (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-mod-body",
						children: [
							error !== null ? (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-mod-note",
								children: [
									t("failed"),
									": ",
									error
								]
							}) : null,
							actionError !== null ? (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-mod-note",
								children: [
									t("failed"),
									": ",
									actionError
								]
							}) : null,
							data?.baseline !== void 0 ? (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-mod-baseline",
								children: [
									t("dock.baseline", { turn: data.baseline.turn }),
									data.baseline.degraded === true ? ` · ${t("degraded")}` : "",
									data.warnings.length > 0 ? (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-mod-warn",
										title: data.warnings.join(" · "),
										children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, {})
									}) : null
								]
							}) : null,
							unaccepted.length === 0 && data !== null && data.modifications.length > 0 ? (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-mod-note",
								children: t("dock.modificationsOnly")
							}) : null,
							unaccepted.length === 0 && data !== null && data.modifications.length === 0 ? (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-mod-empty",
								children: t("dock.empty")
							}) : null,
							(0, react_jsx_runtime.jsx)("ul", {
								className: "dsh-mod-list",
								children: unaccepted.map((change) => (0, react_jsx_runtime.jsx)(FileRow$1, {
									change,
									busy: busy.has(`file:${change.path}`),
									confirmingKey: confirming,
									t,
									onOpenReview: () => {
										openReview(change.path);
									},
									onOpenFile: () => {
										openFile(change);
									},
									onAccept: () => {
										runAcceptFile(change);
									},
									onRequestUndo: () => {
										setConfirming(`file:${change.path}`);
									},
									onConfirmUndo: () => {
										runUndoFile(change);
									},
									onCancelUndo: () => {
										setConfirming(null);
									}
								}, change.path))
							}),
							acceptedFiles.length > 0 ? (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "dsh-mod-accepted-toggle",
								onClick: () => {
									setShowAccepted((value) => !value);
								},
								children: [
									showAccepted ? t("dock.hideAccepted") : t("dock.showAccepted"),
									" (",
									acceptedFiles.length,
									")"
								]
							}) : null,
							showAccepted ? (0, react_jsx_runtime.jsx)("ul", {
								className: "dsh-mod-list dsh-mod-list-accepted",
								children: acceptedFiles.map((change) => (0, react_jsx_runtime.jsx)("li", {
									className: "dsh-mod-file dsh-mod-file-accepted",
									children: (0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-mod-file-row",
										children: [(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dsh-mod-file-path",
											onClick: () => {
												openFile(change);
											},
											title: change.absolutePath,
											children: change.path
										}), (0, react_jsx_runtime.jsx)("span", {
											className: "dsh-mod-status",
											children: t("dock.accepted")
										})]
									})
								}, change.path))
							}) : null,
							(0, react_jsx_runtime.jsx)("div", {
								className: "dsh-mod-tools",
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
									label: t("dock.refresh"),
									side: "bottom",
									children: (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dsh-mod-tool",
										onClick: () => {
											load();
										},
										"aria-label": t("dock.refresh"),
										children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline14, {})
									})
								})
							})
						]
					})]
				})
			});
		}
		function FileRow$1(props) {
			const { change, busy, confirmingKey, t, onOpenReview, onOpenFile, onAccept, onRequestUndo, onConfirmUndo, onCancelUndo } = props;
			const fileConfirming = confirmingKey === `file:${change.path}`;
			const undoConfirm = (0, react_jsx_runtime.jsxs)("span", {
				className: "dsh-mod-confirm",
				children: [(0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dsh-mod-confirm-yes",
					onClick: onConfirmUndo,
					disabled: busy,
					children: t("confirm")
				}), (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dsh-mod-confirm-no",
					onClick: onCancelUndo,
					children: t("cancel")
				})]
			});
			return (0, react_jsx_runtime.jsx)("li", {
				className: "dsh-mod-file",
				children: (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-mod-file-row",
					children: [
						(0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "dsh-mod-file-path",
							onClick: onOpenReview,
							title: `${change.absolutePath} · ${t("openInEditor")}`,
							children: [(0, react_jsx_runtime.jsx)("span", { className: `dsh-mod-status-dot dsh-mod-status-${change.status}` }), change.path]
						}),
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
							label: t("openAt"),
							side: "bottom",
							children: (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-mod-link",
								onClick: onOpenFile,
								"aria-label": t("openAt"),
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline16, { size: 8 })
							})
						}),
						(0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-mod-actions",
							children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("dock.accept"),
								side: "bottom",
								children: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-mod-action",
									onClick: onAccept,
									disabled: busy,
									"aria-label": t("dock.accept"),
									children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline14, {})
								})
							}), fileConfirming ? undoConfirm : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("dock.undo"),
								side: "bottom",
								children: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-mod-action",
									onClick: onRequestUndo,
									disabled: busy,
									"aria-label": t("dock.undo"),
									children: busy ? (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-mod-spin",
										children: "◌"
									}) : (0, react_jsx_runtime.jsx)(IconUndoOutline14, {})
								})
							})]
						})
					]
				})
			});
		}
		//#endregion
		//#region lib/types/client/RollbackAction.js
		function isRemoteOk(value) {
			return value.ok;
		}
		function RollbackAction(props) {
			const { target, prepare, execute, openAt, forkAt, t } = props;
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
					remote = await prepare(target);
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
				const remote = await execute(target, scope === "turn" ? {
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
						children: (0, react_jsx_runtime.jsx)(IconUndoOutline16, {})
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
									onOpen(change.hunks?.[0]?.firstChangedNewLine ?? change.hunks?.[0]?.newLine);
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
		/** Assistant-message entry: the owner supplies the closing messageId. */
		function MessageRollbackAction(props) {
			const { messageId, prepare, execute, openAt, forkAt, t } = props;
			return (0, react_jsx_runtime.jsx)(RollbackAction, {
				target: { messageId },
				prepare,
				execute,
				openAt,
				forkAt,
				t
			});
		}
		/**
		* Turn-tail entry for turns without a text closing assistant (stopped /
		* interrupted / error turns): the ordinary action row never renders, so the
		* rollback button appears here. The chain selector decides the match; this
		* wrapper just anchors the core action to the turn.
		*/
		function TurnRollbackAction(props) {
			const { matched, prepare, execute, openAt, forkAt, t } = props;
			return (0, react_jsx_runtime.jsx)(RollbackAction, {
				target: { turn: matched.turn },
				prepare,
				execute,
				openAt,
				forkAt,
				t
			});
		}
		//#endregion
		//#region lib/types/client/index.js
		const inject = [
			"slots",
			"remote",
			"locale",
			"sessions",
			"workspaces"
		];
		async function apply(ctx) {
			const tagId = "dsh-rollback-plugin/action";
			if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-rollback-plugin";
				tag.dataset.pluginCss = tagId;
				tag.textContent = ".dsh-rollback-action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:transparent;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}.dsh-rollback-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.dsh-mod-dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));margin:0 auto calc(0px - var(--dsh-composer-stack-gap) - 3px);padding:0 var(--dsh-composer-dock-inset);flex:none}.dsh-mod-panel{background:var(--dsw-specific-tip);border-radius:12px 12px 0 0;width:100%;padding:2px 0;position:relative;overflow:hidden}.dsh-mod-panel:after{border:1px solid var(--dsw-alias-border-l1);border-radius:inherit;content:\"\";pointer-events:none;border-bottom:none;position:absolute;inset:0}.dsh-mod-header{box-sizing:border-box;width:100%;min-height:36px;color:var(--dsw-alias-label-primary);border-radius:8px;align-items:center;gap:4px;padding:4px 12px 4px 8px;display:flex}.dsh-mod-toggle{box-sizing:border-box;min-width:0;flex:auto;min-height:32px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;align-items:center;gap:10px;padding:4px;display:flex}.dsh-mod-toggle:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px}.dsh-mod-header-actions{flex:none;align-items:center;gap:4px;display:flex}.dsh-mod-lead{color:var(--dsw-alias-label-tertiary);flex:none;place-items:center;display:grid}.dsh-mod-count{min-width:0;font-family:Inter,var(--dsw-font-family);flex:auto;font-size:13px;font-weight:500;line-height:24px}.dsh-mod-loading{opacity:.6}.dsh-mod-accepted-chip{flex:none;font-family:Inter,var(--dsw-font-family);font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:0 8px}.dsh-mod-chevron{width:14px;height:14px;color:var(--dsw-alias-label-tertiary);flex:none;place-items:center;display:grid}.dsh-mod-baseline{font-family:Inter,var(--dsw-font-family);font-size:12px;color:var(--dsw-alias-label-secondary);padding:2px 12px;display:flex;gap:6px;align-items:center}.dsh-mod-warn{width:14px;height:14px;color:#b8860b;display:grid;place-items:center}.dsh-mod-note{font-family:Inter,var(--dsw-font-family);font-size:12px;color:var(--dsw-alias-label-tertiary);padding:4px 12px}.dsh-mod-empty{font-family:Inter,var(--dsw-font-family);font-size:12px;color:var(--dsw-alias-label-tertiary);padding:6px 12px}.dsh-mod-list{max-height:240px;margin:0;padding:0 4px;list-style:none;overflow-y:auto}.dsh-mod-file{border-radius:8px}.dsh-mod-file:hover{background:var(--dsw-alias-interactive-bg-hover)}.dsh-mod-file-row{box-sizing:border-box;border-radius:8px;align-items:center;gap:8px;width:100%;min-height:32px;padding:4px 5px 4px 12px;display:flex}.dsh-mod-file-path{min-width:0;flex:auto;display:flex;align-items:center;gap:6px;background:0 0;border:none;cursor:pointer;text-align:left;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);font-family:Inter,var(--dsw-font-family);padding:0;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.dsh-mod-file-path:hover{text-decoration:underline}.dsh-mod-status{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}.dsh-mod-status-dot{flex:none;width:8px;height:8px;border-radius:999px;background:var(--dsw-alias-state-business-primary)}.dsh-mod-status-modified{background:var(--dsw-alias-state-business-primary)}.dsh-mod-status-created{background:#2ea043}.dsh-mod-status-deleted{background:#d1242f}.dsh-mod-status-typechange,.dsh-mod-status-binary,.dsh-mod-status-ignored,.dsh-mod-status-nested-repo{background:#b8860b}.dsh-mod-actions{flex:none;align-items:center;gap:6px;display:flex}.dsh-mod-action{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:999px;flex:none;place-items:center;padding:0;display:grid}.dsh-mod-action:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.dsh-mod-action:disabled{cursor:default;opacity:.45}.dsh-mod-link{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:999px;place-items:center;padding:0;display:grid}.dsh-mod-link:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.dsh-mod-spin{display:inline-block;font-size:14px;line-height:1;animation:dsh-mod-rotate 1s linear infinite}@keyframes dsh-mod-rotate{to{transform:rotate(360deg)}}.dsh-mod-confirm{display:inline-flex;gap:4px;align-items:center}.dsh-mod-confirm-yes{font:var(--dsw-font-xs-13);color:#d1242f;background:0 0;border:1px solid #d1242f;border-radius:6px;cursor:pointer;padding:1px 8px;height:22px}.dsh-mod-confirm-no{font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-secondary);background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;cursor:pointer;padding:1px 8px;height:22px}.dsh-mod-detail{padding:2px 12px 8px;display:flex;flex-direction:column;gap:6px}.dsh-mod-patches{border-left:2px solid var(--dsw-alias-border-l1);padding-left:10px;display:flex;flex-direction:column;gap:6px}.dsh-mod-patches-title{font-size:11px;color:var(--dsw-alias-label-tertiary)}.dsh-mod-patch{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px;display:flex;flex-direction:column;gap:4px;background:var(--dsw-alias-bg-base)}.dsh-mod-patch-accepted{opacity:.65}.dsh-mod-patch-row{display:flex;align-items:center;gap:8px;min-height:24px}.dsh-mod-patch-name{flex:auto;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:0 0;border:none;cursor:pointer;text-align:left;padding:0}.dsh-mod-accepted{font-size:11px;color:var(--dsw-alias-label-tertiary)}.dsh-mod-warn-text{font-size:11px;color:#b8860b;display:inline-flex;align-items:center;gap:2px;white-space:nowrap}.dsh-mod-accepted-toggle{width:100%;background:0 0;border:none;cursor:pointer;color:var(--dsw-alias-label-tertiary);font-size:12px;font-family:Inter,var(--dsw-font-family);text-align:left;padding:6px 12px}.dsh-mod-accepted-toggle:hover{color:var(--dsw-alias-label-secondary)}.dsh-mod-list-accepted{opacity:.7;max-height:140px}.dsh-mod-file-accepted .dsh-mod-file-path{color:var(--dsw-alias-label-secondary)}.dsh-mod-tools{display:flex;justify-content:flex-end;padding:2px 8px 4px}.dsh-mod-tool{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:999px;place-items:center;padding:0;display:grid}.dsh-mod-tool:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}";
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
			const rollback = ctx.get("remote.rollback");
			const rollbackFace = (sessionId) => ({
				prepare: (target) => target.messageId !== void 0 ? rollback.prepare(sessionId, target.messageId) : rollback.prepareTurn(sessionId, target.turn ?? 0),
				execute: (target, request) => rollback.execute({
					sessionId,
					...target.messageId !== void 0 ? { messageId: target.messageId } : { turn: target.turn },
					...request
				}),
				openAt: (path, line) => rollback.openAt(sessionId, path, line),
				forkAt: async (seq) => {
					const childId = await sessions.fork({
						sessionId,
						atSeq: seq,
						increaseTitle: true
					});
					sessions.open(childId);
					return childId;
				}
			});
			ctx.slots.inject("conversation.chat.assistant-actions", () => {
				return ctx.slots.register({
					name: "conversation.chat.assistant-actions",
					id: "rollback",
					order: 20,
					locale: NS,
					inject: (sessionId) => rollbackFace(sessionId)
				}, MessageRollbackAction);
			});
			const hasClosingAssistant = (owner) => {
				for (const step of owner.turn.steps) {
					const data = step.data.get("assistant-step");
					if (data === void 0 || data.finalNode === void 0) continue;
					if (data.blocks.some((block) => block.kind === "text" && block.text.trim() !== "")) return true;
				}
				return false;
			};
			ctx.slots.inject("conversation.chat.turnTail", () => {
				return ctx.slots.register({
					name: "conversation.chat.turnTail",
					priority: 100,
					locale: NS,
					select: (owner) => hasClosingAssistant(owner) ? null : { turn: owner.turn.turn },
					inject: (sessionId) => rollbackFace(sessionId)
				}, TurnRollbackAction);
			});
			ctx.slots.inject("conversation.input.dock", () => {
				return ctx.slots.register({
					name: "conversation.input.dock",
					id: "modifications",
					order: 5,
					locale: NS,
					inject: (sessionId) => ({
						sessionChanges: () => rollback.sessionChanges(sessionId),
						acceptAll: (listId) => rollback.acceptAll({
							sessionId,
							listId
						}),
						undoAll: (listId) => rollback.undoAll({
							sessionId,
							listId
						}),
						acceptFile: (path, listId) => rollback.acceptFile({
							sessionId,
							path,
							listId
						}),
						acceptModification: (modificationId, path, listId) => rollback.acceptModification({
							sessionId,
							modificationId,
							path,
							listId
						}),
						undoFile: (path, listId) => rollback.undoFile({
							sessionId,
							path,
							listId
						}),
						undoModification: (modificationId, listId) => rollback.undoModification({
							sessionId,
							modificationId,
							listId
						}),
						openAt: (path, line) => rollback.openAt(sessionId, path, line)
					})
				}, ModificationDock);
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