import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { createScope, scopeOf } from "@deepseek-ai/dsh-scope";
import { randomUUID } from "node:crypto";
import z from "@deepseek-ai/schemastery";
//#region \0rolldown/runtime.js
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __require = /* #__PURE__ */ (() => createRequire(import.meta.url))();
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/nodes/identity.js
var require_identity = /* @__PURE__ */ __commonJSMin(((exports) => {
	const ALIAS = Symbol.for("yaml.alias");
	const DOC = Symbol.for("yaml.document");
	const MAP = Symbol.for("yaml.map");
	const PAIR = Symbol.for("yaml.pair");
	const SCALAR = Symbol.for("yaml.scalar");
	const SEQ = Symbol.for("yaml.seq");
	const NODE_TYPE = Symbol.for("yaml.node.type");
	const isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
	const isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
	const isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
	const isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
	const isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
	const isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
	function isCollection(node) {
		if (node && typeof node === "object") switch (node[NODE_TYPE]) {
			case MAP:
			case SEQ: return true;
		}
		return false;
	}
	function isNode(node) {
		if (node && typeof node === "object") switch (node[NODE_TYPE]) {
			case ALIAS:
			case MAP:
			case SCALAR:
			case SEQ: return true;
		}
		return false;
	}
	const hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
	exports.ALIAS = ALIAS;
	exports.DOC = DOC;
	exports.MAP = MAP;
	exports.NODE_TYPE = NODE_TYPE;
	exports.PAIR = PAIR;
	exports.SCALAR = SCALAR;
	exports.SEQ = SEQ;
	exports.hasAnchor = hasAnchor;
	exports.isAlias = isAlias;
	exports.isCollection = isCollection;
	exports.isDocument = isDocument;
	exports.isMap = isMap;
	exports.isNode = isNode;
	exports.isPair = isPair;
	exports.isScalar = isScalar;
	exports.isSeq = isSeq;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/visit.js
var require_visit = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	const BREAK = Symbol("break visit");
	const SKIP = Symbol("skip children");
	const REMOVE = Symbol("remove node");
	/**
	* Apply a visitor to an AST node or document.
	*
	* Walks through the tree (depth-first) starting from `node`, calling a
	* `visitor` function with three arguments:
	*   - `key`: For sequence values and map `Pair`, the node's index in the
	*     collection. Within a `Pair`, `'key'` or `'value'`, correspondingly.
	*     `null` for the root node.
	*   - `node`: The current node.
	*   - `path`: The ancestry of the current node.
	*
	* The return value of the visitor may be used to control the traversal:
	*   - `undefined` (default): Do nothing and continue
	*   - `visit.SKIP`: Do not visit the children of this node, continue with next
	*     sibling
	*   - `visit.BREAK`: Terminate traversal completely
	*   - `visit.REMOVE`: Remove the current node, then continue with the next one
	*   - `Node`: Replace the current node, then continue by visiting it
	*   - `number`: While iterating the items of a sequence or map, set the index
	*     of the next step. This is useful especially if the index of the current
	*     node has changed.
	*
	* If `visitor` is a single function, it will be called with all values
	* encountered in the tree, including e.g. `null` values. Alternatively,
	* separate visitor functions may be defined for each `Map`, `Pair`, `Seq`,
	* `Alias` and `Scalar` node. To define the same visitor function for more than
	* one node type, use the `Collection` (map and seq), `Value` (map, seq & scalar)
	* and `Node` (alias, map, seq & scalar) targets. Of all these, only the most
	* specific defined one will be used for each node.
	*/
	function visit(node, visitor) {
		const visitor_ = initVisitor(visitor);
		if (identity.isDocument(node)) {
			if (visit_(null, node.contents, visitor_, Object.freeze([node])) === REMOVE) node.contents = null;
		} else visit_(null, node, visitor_, Object.freeze([]));
	}
	/** Terminate visit traversal completely */
	visit.BREAK = BREAK;
	/** Do not visit the children of the current node */
	visit.SKIP = SKIP;
	/** Remove the current node */
	visit.REMOVE = REMOVE;
	function visit_(key, node, visitor, path) {
		const ctrl = callVisitor(key, node, visitor, path);
		if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
			replaceNode(key, path, ctrl);
			return visit_(key, ctrl, visitor, path);
		}
		if (typeof ctrl !== "symbol") {
			if (identity.isCollection(node)) {
				path = Object.freeze(path.concat(node));
				for (let i = 0; i < node.items.length; ++i) {
					const ci = visit_(i, node.items[i], visitor, path);
					if (typeof ci === "number") i = ci - 1;
					else if (ci === BREAK) return BREAK;
					else if (ci === REMOVE) {
						node.items.splice(i, 1);
						i -= 1;
					}
				}
			} else if (identity.isPair(node)) {
				path = Object.freeze(path.concat(node));
				const ck = visit_("key", node.key, visitor, path);
				if (ck === BREAK) return BREAK;
				else if (ck === REMOVE) node.key = null;
				const cv = visit_("value", node.value, visitor, path);
				if (cv === BREAK) return BREAK;
				else if (cv === REMOVE) node.value = null;
			}
		}
		return ctrl;
	}
	/**
	* Apply an async visitor to an AST node or document.
	*
	* Walks through the tree (depth-first) starting from `node`, calling a
	* `visitor` function with three arguments:
	*   - `key`: For sequence values and map `Pair`, the node's index in the
	*     collection. Within a `Pair`, `'key'` or `'value'`, correspondingly.
	*     `null` for the root node.
	*   - `node`: The current node.
	*   - `path`: The ancestry of the current node.
	*
	* The return value of the visitor may be used to control the traversal:
	*   - `Promise`: Must resolve to one of the following values
	*   - `undefined` (default): Do nothing and continue
	*   - `visit.SKIP`: Do not visit the children of this node, continue with next
	*     sibling
	*   - `visit.BREAK`: Terminate traversal completely
	*   - `visit.REMOVE`: Remove the current node, then continue with the next one
	*   - `Node`: Replace the current node, then continue by visiting it
	*   - `number`: While iterating the items of a sequence or map, set the index
	*     of the next step. This is useful especially if the index of the current
	*     node has changed.
	*
	* If `visitor` is a single function, it will be called with all values
	* encountered in the tree, including e.g. `null` values. Alternatively,
	* separate visitor functions may be defined for each `Map`, `Pair`, `Seq`,
	* `Alias` and `Scalar` node. To define the same visitor function for more than
	* one node type, use the `Collection` (map and seq), `Value` (map, seq & scalar)
	* and `Node` (alias, map, seq & scalar) targets. Of all these, only the most
	* specific defined one will be used for each node.
	*/
	async function visitAsync(node, visitor) {
		const visitor_ = initVisitor(visitor);
		if (identity.isDocument(node)) {
			if (await visitAsync_(null, node.contents, visitor_, Object.freeze([node])) === REMOVE) node.contents = null;
		} else await visitAsync_(null, node, visitor_, Object.freeze([]));
	}
	/** Terminate visit traversal completely */
	visitAsync.BREAK = BREAK;
	/** Do not visit the children of the current node */
	visitAsync.SKIP = SKIP;
	/** Remove the current node */
	visitAsync.REMOVE = REMOVE;
	async function visitAsync_(key, node, visitor, path) {
		const ctrl = await callVisitor(key, node, visitor, path);
		if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
			replaceNode(key, path, ctrl);
			return visitAsync_(key, ctrl, visitor, path);
		}
		if (typeof ctrl !== "symbol") {
			if (identity.isCollection(node)) {
				path = Object.freeze(path.concat(node));
				for (let i = 0; i < node.items.length; ++i) {
					const ci = await visitAsync_(i, node.items[i], visitor, path);
					if (typeof ci === "number") i = ci - 1;
					else if (ci === BREAK) return BREAK;
					else if (ci === REMOVE) {
						node.items.splice(i, 1);
						i -= 1;
					}
				}
			} else if (identity.isPair(node)) {
				path = Object.freeze(path.concat(node));
				const ck = await visitAsync_("key", node.key, visitor, path);
				if (ck === BREAK) return BREAK;
				else if (ck === REMOVE) node.key = null;
				const cv = await visitAsync_("value", node.value, visitor, path);
				if (cv === BREAK) return BREAK;
				else if (cv === REMOVE) node.value = null;
			}
		}
		return ctrl;
	}
	function initVisitor(visitor) {
		if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) return Object.assign({
			Alias: visitor.Node,
			Map: visitor.Node,
			Scalar: visitor.Node,
			Seq: visitor.Node
		}, visitor.Value && {
			Map: visitor.Value,
			Scalar: visitor.Value,
			Seq: visitor.Value
		}, visitor.Collection && {
			Map: visitor.Collection,
			Seq: visitor.Collection
		}, visitor);
		return visitor;
	}
	function callVisitor(key, node, visitor, path) {
		if (typeof visitor === "function") return visitor(key, node, path);
		if (identity.isMap(node)) return visitor.Map?.(key, node, path);
		if (identity.isSeq(node)) return visitor.Seq?.(key, node, path);
		if (identity.isPair(node)) return visitor.Pair?.(key, node, path);
		if (identity.isScalar(node)) return visitor.Scalar?.(key, node, path);
		if (identity.isAlias(node)) return visitor.Alias?.(key, node, path);
	}
	function replaceNode(key, path, node) {
		const parent = path[path.length - 1];
		if (identity.isCollection(parent)) parent.items[key] = node;
		else if (identity.isPair(parent)) {
			if (key === "key") parent.key = node;
			else parent.value = node;
		} else if (identity.isDocument(parent)) parent.contents = node;
		else {
			const pt = identity.isAlias(parent) ? "alias" : "scalar";
			throw new Error(`Cannot replace node with ${pt} parent`);
		}
	}
	exports.visit = visit;
	exports.visitAsync = visitAsync;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/doc/directives.js
var require_directives = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var visit = require_visit();
	const escapeChars = {
		"!": "%21",
		",": "%2C",
		"[": "%5B",
		"]": "%5D",
		"{": "%7B",
		"}": "%7D"
	};
	const escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
	var Directives = class Directives {
		constructor(yaml, tags) {
			/**
			* The directives-end/doc-start marker `---`. If `null`, a marker may still be
			* included in the document's stringified representation.
			*/
			this.docStart = null;
			/** The doc-end marker `...`.  */
			this.docEnd = false;
			this.yaml = Object.assign({}, Directives.defaultYaml, yaml);
			this.tags = Object.assign({}, Directives.defaultTags, tags);
		}
		clone() {
			const copy = new Directives(this.yaml, this.tags);
			copy.docStart = this.docStart;
			return copy;
		}
		/**
		* During parsing, get a Directives instance for the current document and
		* update the stream state according to the current version's spec.
		*/
		atDocument() {
			const res = new Directives(this.yaml, this.tags);
			switch (this.yaml.version) {
				case "1.1":
					this.atNextDocument = true;
					break;
				case "1.2":
					this.atNextDocument = false;
					this.yaml = {
						explicit: Directives.defaultYaml.explicit,
						version: "1.2"
					};
					this.tags = Object.assign({}, Directives.defaultTags);
			}
			return res;
		}
		/**
		* @param onError - May be called even if the action was successful
		* @returns `true` on success
		*/
		add(line, onError) {
			if (this.atNextDocument) {
				this.yaml = {
					explicit: Directives.defaultYaml.explicit,
					version: "1.1"
				};
				this.tags = Object.assign({}, Directives.defaultTags);
				this.atNextDocument = false;
			}
			const parts = line.trim().split(/[ \t]+/);
			const name = parts.shift();
			switch (name) {
				case "%TAG": {
					if (parts.length !== 2) {
						onError(0, "%TAG directive should contain exactly two parts");
						if (parts.length < 2) return false;
					}
					const [handle, prefix] = parts;
					this.tags[handle] = prefix;
					return true;
				}
				case "%YAML": {
					this.yaml.explicit = true;
					if (parts.length !== 1) {
						onError(0, "%YAML directive should contain exactly one part");
						return false;
					}
					const [version] = parts;
					if (version === "1.1" || version === "1.2") {
						this.yaml.version = version;
						return true;
					} else {
						const isValid = /^\d+\.\d+$/.test(version);
						onError(6, `Unsupported YAML version ${version}`, isValid);
						return false;
					}
				}
				default:
					onError(0, `Unknown directive ${name}`, true);
					return false;
			}
		}
		/**
		* Resolves a tag, matching handles to those defined in %TAG directives.
		*
		* @returns Resolved tag, which may also be the non-specific tag `'!'` or a
		*   `'!local'` tag, or `null` if unresolvable.
		*/
		tagName(source, onError) {
			if (source === "!") return "!";
			if (source[0] !== "!") {
				onError(`Not a valid tag: ${source}`);
				return null;
			}
			if (source[1] === "<") {
				const verbatim = source.slice(2, -1);
				if (verbatim === "!" || verbatim === "!!") {
					onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
					return null;
				}
				if (source[source.length - 1] !== ">") onError("Verbatim tags must end with a >");
				return verbatim;
			}
			const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
			if (!suffix) onError(`The ${source} tag has no suffix`);
			const prefix = this.tags[handle];
			if (prefix) try {
				return prefix + decodeURIComponent(suffix);
			} catch (error) {
				onError(String(error));
				return null;
			}
			if (handle === "!") return source;
			onError(`Could not resolve tag: ${source}`);
			return null;
		}
		/**
		* Given a fully resolved tag, returns its printable string form,
		* taking into account current tag prefixes and defaults.
		*/
		tagString(tag) {
			for (const [handle, prefix] of Object.entries(this.tags)) if (tag.startsWith(prefix)) return handle + escapeTagName(tag.substring(prefix.length));
			return tag[0] === "!" ? tag : `!<${tag}>`;
		}
		toString(doc) {
			const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
			const tagEntries = Object.entries(this.tags);
			let tagNames;
			if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
				const tags = {};
				visit.visit(doc.contents, (_key, node) => {
					if (identity.isNode(node) && node.tag) tags[node.tag] = true;
				});
				tagNames = Object.keys(tags);
			} else tagNames = [];
			for (const [handle, prefix] of tagEntries) {
				if (handle === "!!" && prefix === "tag:yaml.org,2002:") continue;
				if (!doc || tagNames.some((tn) => tn.startsWith(prefix))) lines.push(`%TAG ${handle} ${prefix}`);
			}
			return lines.join("\n");
		}
	};
	Directives.defaultYaml = {
		explicit: false,
		version: "1.2"
	};
	Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
	exports.Directives = Directives;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/doc/anchors.js
var require_anchors = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var visit = require_visit();
	/**
	* Verify that the input string is a valid anchor.
	*
	* Will throw on errors.
	*/
	function anchorIsValid(anchor) {
		if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
			const msg = `Anchor must not contain whitespace or control characters: ${JSON.stringify(anchor)}`;
			throw new Error(msg);
		}
		return true;
	}
	function anchorNames(root) {
		const anchors = /* @__PURE__ */ new Set();
		visit.visit(root, { Value(_key, node) {
			if (node.anchor) anchors.add(node.anchor);
		} });
		return anchors;
	}
	/** Find a new anchor name with the given `prefix` and a one-indexed suffix. */
	function findNewAnchor(prefix, exclude) {
		for (let i = 1;; ++i) {
			const name = `${prefix}${i}`;
			if (!exclude.has(name)) return name;
		}
	}
	function createNodeAnchors(doc, prefix) {
		const aliasObjects = [];
		const sourceObjects = /* @__PURE__ */ new Map();
		let prevAnchors = null;
		return {
			onAnchor: (source) => {
				aliasObjects.push(source);
				prevAnchors ?? (prevAnchors = anchorNames(doc));
				const anchor = findNewAnchor(prefix, prevAnchors);
				prevAnchors.add(anchor);
				return anchor;
			},
			/**
			* With circular references, the source node is only resolved after all
			* of its child nodes are. This is why anchors are set only after all of
			* the nodes have been created.
			*/
			setAnchors: () => {
				for (const source of aliasObjects) {
					const ref = sourceObjects.get(source);
					if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) ref.node.anchor = ref.anchor;
					else {
						const error = /* @__PURE__ */ new Error("Failed to resolve repeated object (this should not happen)");
						error.source = source;
						throw error;
					}
				}
			},
			sourceObjects
		};
	}
	exports.anchorIsValid = anchorIsValid;
	exports.anchorNames = anchorNames;
	exports.createNodeAnchors = createNodeAnchors;
	exports.findNewAnchor = findNewAnchor;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* Applies the JSON.parse reviver algorithm as defined in the ECMA-262 spec,
	* in section 24.5.1.1 "Runtime Semantics: InternalizeJSONProperty" of the
	* 2021 edition: https://tc39.es/ecma262/#sec-json.parse
	*
	* Includes extensions for handling Map and Set objects.
	*/
	function applyReviver(reviver, obj, key, val) {
		if (val && typeof val === "object") {
			if (Array.isArray(val)) for (let i = 0, len = val.length; i < len; ++i) {
				const v0 = val[i];
				const v1 = applyReviver(reviver, val, String(i), v0);
				if (v1 === void 0) delete val[i];
				else if (v1 !== v0) val[i] = v1;
			}
			else if (val instanceof Map) for (const k of Array.from(val.keys())) {
				const v0 = val.get(k);
				const v1 = applyReviver(reviver, val, k, v0);
				if (v1 === void 0) val.delete(k);
				else if (v1 !== v0) val.set(k, v1);
			}
			else if (val instanceof Set) for (const v0 of Array.from(val)) {
				const v1 = applyReviver(reviver, val, v0, v0);
				if (v1 === void 0) val.delete(v0);
				else if (v1 !== v0) {
					val.delete(v0);
					val.add(v1);
				}
			}
			else for (const [k, v0] of Object.entries(val)) {
				const v1 = applyReviver(reviver, val, k, v0);
				if (v1 === void 0) delete val[k];
				else if (v1 !== v0) val[k] = v1;
			}
		}
		return reviver.call(obj, key, val);
	}
	exports.applyReviver = applyReviver;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/nodes/toJS.js
var require_toJS = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	/**
	* Recursively convert any node or its contents to native JavaScript
	*
	* @param value - The input value
	* @param arg - If `value` defines a `toJSON()` method, use this
	*   as its first argument
	* @param ctx - Conversion context, originally set in Document#toJS(). If
	*   `{ keep: true }` is not set, output should be suitable for JSON
	*   stringification.
	*/
	function toJS(value, arg, ctx) {
		if (Array.isArray(value)) return value.map((v, i) => toJS(v, String(i), ctx));
		if (value && typeof value.toJSON === "function") {
			if (!ctx || !identity.hasAnchor(value)) return value.toJSON(arg, ctx);
			const data = {
				aliasCount: 0,
				count: 1,
				res: void 0
			};
			ctx.anchors.set(value, data);
			ctx.onCreate = (res) => {
				data.res = res;
				delete ctx.onCreate;
			};
			const res = value.toJSON(arg, ctx);
			if (ctx.onCreate) ctx.onCreate(res);
			return res;
		}
		if (typeof value === "bigint" && !ctx?.keep) return Number(value);
		return value;
	}
	exports.toJS = toJS;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/nodes/Node.js
var require_Node = /* @__PURE__ */ __commonJSMin(((exports) => {
	var applyReviver = require_applyReviver();
	var identity = require_identity();
	var toJS = require_toJS();
	var NodeBase = class {
		constructor(type) {
			Object.defineProperty(this, identity.NODE_TYPE, { value: type });
		}
		/** Create a copy of this node.  */
		clone() {
			const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
			if (this.range) copy.range = this.range.slice();
			return copy;
		}
		/** A plain JavaScript representation of this node. */
		toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
			if (!identity.isDocument(doc)) throw new TypeError("A document argument is required");
			const ctx = {
				anchors: /* @__PURE__ */ new Map(),
				doc,
				keep: true,
				mapAsMap: mapAsMap === true,
				mapKeyWarned: false,
				maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
			};
			const res = toJS.toJS(this, "", ctx);
			if (typeof onAnchor === "function") for (const { count, res } of ctx.anchors.values()) onAnchor(res, count);
			return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
		}
	};
	exports.NodeBase = NodeBase;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/nodes/Alias.js
var require_Alias = /* @__PURE__ */ __commonJSMin(((exports) => {
	var anchors = require_anchors();
	var visit = require_visit();
	var identity = require_identity();
	var Node = require_Node();
	var toJS = require_toJS();
	var Alias = class extends Node.NodeBase {
		constructor(source) {
			super(identity.ALIAS);
			this.source = source;
			Object.defineProperty(this, "tag", { set() {
				throw new Error("Alias nodes cannot have tags");
			} });
		}
		/**
		* Resolve the value of this alias within `doc`, finding the last
		* instance of the `source` anchor before this node.
		*/
		resolve(doc, ctx) {
			if (ctx?.maxAliasCount === 0) throw new ReferenceError("Alias resolution is disabled");
			let nodes;
			if (ctx?.aliasResolveCache) nodes = ctx.aliasResolveCache;
			else {
				nodes = [];
				visit.visit(doc, { Node: (_key, node) => {
					if (identity.isAlias(node) || identity.hasAnchor(node)) nodes.push(node);
				} });
				if (ctx) ctx.aliasResolveCache = nodes;
			}
			let found = void 0;
			for (const node of nodes) {
				if (node === this) break;
				if (node.anchor === this.source) found = node;
			}
			return found;
		}
		toJSON(_arg, ctx) {
			if (!ctx) return { source: this.source };
			const { anchors, doc, maxAliasCount } = ctx;
			const source = this.resolve(doc, ctx);
			if (!source) {
				const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
				throw new ReferenceError(msg);
			}
			let data = anchors.get(source);
			if (!data) {
				toJS.toJS(source, null, ctx);
				data = anchors.get(source);
			}
			/* istanbul ignore if */
			if (data?.res === void 0) throw new ReferenceError("This should not happen: Alias anchor was not resolved?");
			if (maxAliasCount >= 0) {
				data.count += 1;
				if (data.aliasCount === 0) data.aliasCount = getAliasCount(doc, source, anchors);
				if (data.count * data.aliasCount > maxAliasCount) throw new ReferenceError("Excessive alias count indicates a resource exhaustion attack");
			}
			return data.res;
		}
		toString(ctx, _onComment, _onChompKeep) {
			const src = `*${this.source}`;
			if (ctx) {
				anchors.anchorIsValid(this.source);
				if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
					const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
					throw new Error(msg);
				}
				if (ctx.implicitKey) return `${src} `;
			}
			return src;
		}
	};
	function getAliasCount(doc, node, anchors) {
		if (identity.isAlias(node)) {
			const source = node.resolve(doc);
			const anchor = anchors && source && anchors.get(source);
			return anchor ? anchor.count * anchor.aliasCount : 0;
		} else if (identity.isCollection(node)) {
			let count = 0;
			for (const item of node.items) {
				const c = getAliasCount(doc, item, anchors);
				if (c > count) count = c;
			}
			return count;
		} else if (identity.isPair(node)) {
			const kc = getAliasCount(doc, node.key, anchors);
			const vc = getAliasCount(doc, node.value, anchors);
			return Math.max(kc, vc);
		}
		return 1;
	}
	exports.Alias = Alias;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Node = require_Node();
	var toJS = require_toJS();
	const isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
	var Scalar = class extends Node.NodeBase {
		constructor(value) {
			super(identity.SCALAR);
			this.value = value;
		}
		toJSON(arg, ctx) {
			return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
		}
		toString() {
			return String(this.value);
		}
	};
	Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
	Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
	Scalar.PLAIN = "PLAIN";
	Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
	Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
	exports.Scalar = Scalar;
	exports.isScalarValue = isScalarValue;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/doc/createNode.js
var require_createNode = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Alias = require_Alias();
	var identity = require_identity();
	var Scalar = require_Scalar();
	const defaultTagPrefix = "tag:yaml.org,2002:";
	function findTagObject(value, tagName, tags) {
		if (tagName) {
			const match = tags.filter((t) => t.tag === tagName);
			const tagObj = match.find((t) => !t.format) ?? match[0];
			if (!tagObj) throw new Error(`Tag ${tagName} not found`);
			return tagObj;
		}
		return tags.find((t) => t.identify?.(value) && !t.format);
	}
	function createNode(value, tagName, ctx) {
		if (identity.isDocument(value)) value = value.contents;
		if (identity.isNode(value)) return value;
		if (identity.isPair(value)) {
			const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
			map.items.push(value);
			return map;
		}
		if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) value = value.valueOf();
		const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
		let ref = void 0;
		if (aliasDuplicateObjects && value && typeof value === "object") {
			ref = sourceObjects.get(value);
			if (ref) {
				ref.anchor ?? (ref.anchor = onAnchor(value));
				return new Alias.Alias(ref.anchor);
			} else {
				ref = {
					anchor: null,
					node: null
				};
				sourceObjects.set(value, ref);
			}
		}
		if (tagName?.startsWith("!!")) tagName = defaultTagPrefix + tagName.slice(2);
		let tagObj = findTagObject(value, tagName, schema.tags);
		if (!tagObj) {
			if (value && typeof value.toJSON === "function") value = value.toJSON();
			if (!value || typeof value !== "object") {
				const node = new Scalar.Scalar(value);
				if (ref) ref.node = node;
				return node;
			}
			tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
		}
		if (onTagObj) {
			onTagObj(tagObj);
			delete ctx.onTagObj;
		}
		const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
		if (tagName) node.tag = tagName;
		else if (!tagObj.default) node.tag = tagObj.tag;
		if (ref) ref.node = node;
		return node;
	}
	exports.createNode = createNode;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/nodes/Collection.js
var require_Collection = /* @__PURE__ */ __commonJSMin(((exports) => {
	var createNode = require_createNode();
	var identity = require_identity();
	var Node = require_Node();
	function collectionFromPath(schema, path, value) {
		let v = value;
		for (let i = path.length - 1; i >= 0; --i) {
			const k = path[i];
			if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
				const a = [];
				a[k] = v;
				v = a;
			} else v = /* @__PURE__ */ new Map([[k, v]]);
		}
		return createNode.createNode(v, void 0, {
			aliasDuplicateObjects: false,
			keepUndefined: false,
			onAnchor: () => {
				throw new Error("This should not happen, please report a bug.");
			},
			schema,
			sourceObjects: /* @__PURE__ */ new Map()
		});
	}
	const isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
	var Collection = class extends Node.NodeBase {
		constructor(type, schema) {
			super(type);
			Object.defineProperty(this, "schema", {
				value: schema,
				configurable: true,
				enumerable: false,
				writable: true
			});
		}
		/**
		* Create a copy of this collection.
		*
		* @param schema - If defined, overwrites the original's schema
		*/
		clone(schema) {
			const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
			if (schema) copy.schema = schema;
			copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
			if (this.range) copy.range = this.range.slice();
			return copy;
		}
		/**
		* Adds a value to the collection. For `!!map` and `!!omap` the value must
		* be a Pair instance or a `{ key, value }` object, which may not have a key
		* that already exists in the map.
		*/
		addIn(path, value) {
			if (isEmptyPath(path)) this.add(value);
			else {
				const [key, ...rest] = path;
				const node = this.get(key, true);
				if (identity.isCollection(node)) node.addIn(rest, value);
				else if (node === void 0 && this.schema) this.set(key, collectionFromPath(this.schema, rest, value));
				else throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
			}
		}
		/**
		* Removes a value from the collection.
		* @returns `true` if the item was found and removed.
		*/
		deleteIn(path) {
			const [key, ...rest] = path;
			if (rest.length === 0) return this.delete(key);
			const node = this.get(key, true);
			if (identity.isCollection(node)) return node.deleteIn(rest);
			else throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
		}
		/**
		* Returns item at `key`, or `undefined` if not found. By default unwraps
		* scalar values from their surrounding node; to disable set `keepScalar` to
		* `true` (collections are always returned intact).
		*/
		getIn(path, keepScalar) {
			const [key, ...rest] = path;
			const node = this.get(key, true);
			if (rest.length === 0) return !keepScalar && identity.isScalar(node) ? node.value : node;
			else return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
		}
		hasAllNullValues(allowScalar) {
			return this.items.every((node) => {
				if (!identity.isPair(node)) return false;
				const n = node.value;
				return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
			});
		}
		/**
		* Checks if the collection includes a value with the key `key`.
		*/
		hasIn(path) {
			const [key, ...rest] = path;
			if (rest.length === 0) return this.has(key);
			const node = this.get(key, true);
			return identity.isCollection(node) ? node.hasIn(rest) : false;
		}
		/**
		* Sets a value in this collection. For `!!set`, `value` needs to be a
		* boolean to add/remove the item from the set.
		*/
		setIn(path, value) {
			const [key, ...rest] = path;
			if (rest.length === 0) this.set(key, value);
			else {
				const node = this.get(key, true);
				if (identity.isCollection(node)) node.setIn(rest, value);
				else if (node === void 0 && this.schema) this.set(key, collectionFromPath(this.schema, rest, value));
				else throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
			}
		}
	};
	exports.Collection = Collection;
	exports.collectionFromPath = collectionFromPath;
	exports.isEmptyPath = isEmptyPath;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* Stringifies a comment.
	*
	* Empty comment lines are left empty,
	* lines consisting of a single space are replaced by `#`,
	* and all other lines are prefixed with a `#`.
	*/
	const stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
	function indentComment(comment, indent) {
		if (/^\n+$/.test(comment)) return comment.substring(1);
		return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
	}
	const lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
	exports.indentComment = indentComment;
	exports.lineComment = lineComment;
	exports.stringifyComment = stringifyComment;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = /* @__PURE__ */ __commonJSMin(((exports) => {
	const FOLD_FLOW = "flow";
	const FOLD_BLOCK = "block";
	const FOLD_QUOTED = "quoted";
	/**
	* Tries to keep input at up to `lineWidth` characters, splitting only on spaces
	* not followed by newlines or spaces unless `mode` is `'quoted'`. Lines are
	* terminated with `\n` and started with `indent`.
	*/
	function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
		if (!lineWidth || lineWidth < 0) return text;
		if (lineWidth < minContentWidth) minContentWidth = 0;
		const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
		if (text.length <= endStep) return text;
		const folds = [];
		const escapedFolds = {};
		let end = lineWidth - indent.length;
		if (typeof indentAtStart === "number") {
			if (indentAtStart > lineWidth - Math.max(2, minContentWidth)) folds.push(0);
			else end = lineWidth - indentAtStart;
		}
		let split = void 0;
		let prev = void 0;
		let overflow = false;
		let i = -1;
		let escStart = -1;
		let escEnd = -1;
		if (mode === FOLD_BLOCK) {
			i = consumeMoreIndentedLines(text, i, indent.length);
			if (i !== -1) end = i + endStep;
		}
		for (let ch; ch = text[i += 1];) {
			if (mode === FOLD_QUOTED && ch === "\\") {
				escStart = i;
				switch (text[i + 1]) {
					case "x":
						i += 3;
						break;
					case "u":
						i += 5;
						break;
					case "U":
						i += 9;
						break;
					default: i += 1;
				}
				escEnd = i;
			}
			if (ch === "\n") {
				if (mode === FOLD_BLOCK) i = consumeMoreIndentedLines(text, i, indent.length);
				end = i + indent.length + endStep;
				split = void 0;
			} else {
				if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
					const next = text[i + 1];
					if (next && next !== " " && next !== "\n" && next !== "	") split = i;
				}
				if (i >= end) {
					if (split) {
						folds.push(split);
						end = split + endStep;
						split = void 0;
					} else if (mode === FOLD_QUOTED) {
						while (prev === " " || prev === "	") {
							prev = ch;
							ch = text[i += 1];
							overflow = true;
						}
						const j = i > escEnd + 1 ? i - 2 : escStart - 1;
						if (escapedFolds[j]) return text;
						folds.push(j);
						escapedFolds[j] = true;
						end = j + endStep;
						split = void 0;
					} else overflow = true;
				}
			}
			prev = ch;
		}
		if (overflow && onOverflow) onOverflow();
		if (folds.length === 0) return text;
		if (onFold) onFold();
		let res = text.slice(0, folds[0]);
		for (let i = 0; i < folds.length; ++i) {
			const fold = folds[i];
			const end = folds[i + 1] || text.length;
			if (fold === 0) res = `\n${indent}${text.slice(0, end)}`;
			else {
				if (mode === FOLD_QUOTED && escapedFolds[fold]) res += `${text[fold]}\\`;
				res += `\n${indent}${text.slice(fold + 1, end)}`;
			}
		}
		return res;
	}
	/**
	* Presumes `i + 1` is at the start of a line
	* @returns index of last newline in more-indented block
	*/
	function consumeMoreIndentedLines(text, i, indent) {
		let end = i;
		let start = i + 1;
		let ch = text[start];
		while (ch === " " || ch === "	") if (i < start + indent) ch = text[++i];
		else {
			do
				ch = text[++i];
			while (ch && ch !== "\n");
			end = i;
			start = i + 1;
			ch = text[start];
		}
		return end;
	}
	exports.FOLD_BLOCK = FOLD_BLOCK;
	exports.FOLD_FLOW = FOLD_FLOW;
	exports.FOLD_QUOTED = FOLD_QUOTED;
	exports.foldFlowLines = foldFlowLines;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	var foldFlowLines = require_foldFlowLines();
	const getFoldOptions = (ctx, isBlock) => ({
		indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
		lineWidth: ctx.options.lineWidth,
		minContentWidth: ctx.options.minContentWidth
	});
	const containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
	function lineLengthOverLimit(str, lineWidth, indentLength) {
		if (!lineWidth || lineWidth < 0) return false;
		const limit = lineWidth - indentLength;
		const strLen = str.length;
		if (strLen <= limit) return false;
		for (let i = 0, start = 0; i < strLen; ++i) if (str[i] === "\n") {
			if (i - start > limit) return true;
			start = i + 1;
			if (strLen - start <= limit) return false;
		}
		return true;
	}
	function doubleQuotedString(value, ctx) {
		const json = JSON.stringify(value);
		if (ctx.options.doubleQuotedAsJSON) return json;
		const { implicitKey } = ctx;
		const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
		const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
		let str = "";
		let start = 0;
		for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
			if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
				str += json.slice(start, i) + "\\ ";
				i += 1;
				start = i;
				ch = "\\";
			}
			if (ch === "\\") switch (json[i + 1]) {
				case "u":
					{
						str += json.slice(start, i);
						const code = json.substr(i + 2, 4);
						switch (code) {
							case "0000":
								str += "\\0";
								break;
							case "0007":
								str += "\\a";
								break;
							case "000b":
								str += "\\v";
								break;
							case "001b":
								str += "\\e";
								break;
							case "0085":
								str += "\\N";
								break;
							case "00a0":
								str += "\\_";
								break;
							case "2028":
								str += "\\L";
								break;
							case "2029":
								str += "\\P";
								break;
							default: if (code.substr(0, 2) === "00") str += "\\x" + code.substr(2);
							else str += json.substr(i, 6);
						}
						i += 5;
						start = i + 1;
					}
					break;
				case "n":
					if (implicitKey || json[i + 2] === "\"" || json.length < minMultiLineLength) i += 1;
					else {
						str += json.slice(start, i) + "\n\n";
						while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== "\"") {
							str += "\n";
							i += 2;
						}
						str += indent;
						if (json[i + 2] === " ") str += "\\";
						i += 1;
						start = i + 1;
					}
					break;
				default: i += 1;
			}
		}
		str = start ? str + json.slice(start) : json;
		return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
	}
	function singleQuotedString(value, ctx) {
		if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value)) return doubleQuotedString(value, ctx);
		const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
		const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&\n${indent}`) + "'";
		return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
	}
	function quotedString(value, ctx) {
		const { singleQuote } = ctx.options;
		let qs;
		if (singleQuote === false) qs = doubleQuotedString;
		else {
			const hasDouble = value.includes("\"");
			const hasSingle = value.includes("'");
			if (hasDouble && !hasSingle) qs = singleQuotedString;
			else if (hasSingle && !hasDouble) qs = doubleQuotedString;
			else qs = singleQuote ? singleQuotedString : doubleQuotedString;
		}
		return qs(value, ctx);
	}
	let blockEndNewlines;
	try {
		blockEndNewlines = /* @__PURE__ */ new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
	} catch {
		blockEndNewlines = /\n+(?!\n|$)/g;
	}
	function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
		const { blockQuote, commentString, lineWidth } = ctx.options;
		if (!blockQuote || /\n[\t ]+$/.test(value)) return quotedString(value, ctx);
		const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
		const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
		if (!value) return literal ? "|\n" : ">\n";
		let chomp;
		let endStart;
		for (endStart = value.length; endStart > 0; --endStart) {
			const ch = value[endStart - 1];
			if (ch !== "\n" && ch !== "	" && ch !== " ") break;
		}
		let end = value.substring(endStart);
		const endNlPos = end.indexOf("\n");
		if (endNlPos === -1) chomp = "-";
		else if (value === end || endNlPos !== end.length - 1) {
			chomp = "+";
			if (onChompKeep) onChompKeep();
		} else chomp = "";
		if (end) {
			value = value.slice(0, -end.length);
			if (end[end.length - 1] === "\n") end = end.slice(0, -1);
			end = end.replace(blockEndNewlines, `$&${indent}`);
		}
		let startWithSpace = false;
		let startEnd;
		let startNlPos = -1;
		for (startEnd = 0; startEnd < value.length; ++startEnd) {
			const ch = value[startEnd];
			if (ch === " ") startWithSpace = true;
			else if (ch === "\n") startNlPos = startEnd;
			else break;
		}
		let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
		if (start) {
			value = value.substring(start.length);
			start = start.replace(/\n+/g, `$&${indent}`);
		}
		let header = (startWithSpace ? indent ? "2" : "1" : "") + chomp;
		if (comment) {
			header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
			if (onComment) onComment();
		}
		if (!literal) {
			const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
			let literalFallback = false;
			const foldOptions = getFoldOptions(ctx, true);
			if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) foldOptions.onOverflow = () => {
				literalFallback = true;
			};
			const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
			if (!literalFallback) return `>${header}\n${indent}${body}`;
		}
		value = value.replace(/\n+/g, `$&${indent}`);
		return `|${header}\n${indent}${start}${value}${end}`;
	}
	function plainString(item, ctx, onComment, onChompKeep) {
		const { type, value } = item;
		const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
		if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) return quotedString(value, ctx);
		if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
		if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) return blockString(item, ctx, onComment, onChompKeep);
		if (containsDocumentMarker(value)) {
			if (indent === "") {
				ctx.forceBlockIndent = true;
				return blockString(item, ctx, onComment, onChompKeep);
			} else if (implicitKey && indent === indentStep) return quotedString(value, ctx);
		}
		const str = value.replace(/\n+/g, `$&\n${indent}`);
		if (actualString) {
			const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
			const { compat, tags } = ctx.doc.schema;
			if (tags.some(test) || compat?.some(test)) return quotedString(value, ctx);
		}
		return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
	}
	function stringifyString(item, ctx, onComment, onChompKeep) {
		const { implicitKey, inFlow } = ctx;
		const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
		let { type } = item;
		if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
			if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value)) type = Scalar.Scalar.QUOTE_DOUBLE;
		}
		const _stringify = (_type) => {
			switch (_type) {
				case Scalar.Scalar.BLOCK_FOLDED:
				case Scalar.Scalar.BLOCK_LITERAL: return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
				case Scalar.Scalar.QUOTE_DOUBLE: return doubleQuotedString(ss.value, ctx);
				case Scalar.Scalar.QUOTE_SINGLE: return singleQuotedString(ss.value, ctx);
				case Scalar.Scalar.PLAIN: return plainString(ss, ctx, onComment, onChompKeep);
				default: return null;
			}
		};
		let res = _stringify(type);
		if (res === null) {
			const { defaultKeyType, defaultStringType } = ctx.options;
			const t = implicitKey && defaultKeyType || defaultStringType;
			res = _stringify(t);
			if (res === null) throw new Error(`Unsupported default string type ${t}`);
		}
		return res;
	}
	exports.stringifyString = stringifyString;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/stringify/stringify.js
var require_stringify = /* @__PURE__ */ __commonJSMin(((exports) => {
	var anchors = require_anchors();
	var identity = require_identity();
	var stringifyComment = require_stringifyComment();
	var stringifyString = require_stringifyString();
	function createStringifyContext(doc, options) {
		const opt = Object.assign({
			blockQuote: true,
			commentString: stringifyComment.stringifyComment,
			defaultKeyType: null,
			defaultStringType: "PLAIN",
			directives: null,
			doubleQuotedAsJSON: false,
			doubleQuotedMinMultiLineLength: 40,
			falseStr: "false",
			flowCollectionPadding: true,
			indentSeq: true,
			lineWidth: 80,
			minContentWidth: 20,
			nullStr: "null",
			simpleKeys: false,
			singleQuote: null,
			trailingComma: false,
			trueStr: "true",
			verifyAliasOrder: true
		}, doc.schema.toStringOptions, options);
		let inFlow;
		switch (opt.collectionStyle) {
			case "block":
				inFlow = false;
				break;
			case "flow":
				inFlow = true;
				break;
			default: inFlow = null;
		}
		return {
			anchors: /* @__PURE__ */ new Set(),
			doc,
			flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
			indent: "",
			indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
			inFlow,
			options: opt
		};
	}
	function getTagObject(tags, item) {
		if (item.tag) {
			const match = tags.filter((t) => t.tag === item.tag);
			if (match.length > 0) return match.find((t) => t.format === item.format) ?? match[0];
		}
		let tagObj = void 0;
		let obj;
		if (identity.isScalar(item)) {
			obj = item.value;
			let match = tags.filter((t) => t.identify?.(obj));
			if (match.length > 1) {
				const testMatch = match.filter((t) => t.test);
				if (testMatch.length > 0) match = testMatch;
			}
			tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
		} else {
			obj = item;
			tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
		}
		if (!tagObj) {
			const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
			throw new Error(`Tag not resolved for ${name} value`);
		}
		return tagObj;
	}
	function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
		if (!doc.directives) return "";
		const props = [];
		const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
		if (anchor && anchors.anchorIsValid(anchor)) {
			anchors$1.add(anchor);
			props.push(`&${anchor}`);
		}
		const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
		if (tag) props.push(doc.directives.tagString(tag));
		return props.join(" ");
	}
	function stringify(item, ctx, onComment, onChompKeep) {
		if (identity.isPair(item)) return item.toString(ctx, onComment, onChompKeep);
		if (identity.isAlias(item)) {
			if (ctx.doc.directives) return item.toString(ctx);
			if (ctx.resolvedAliases?.has(item)) throw new TypeError(`Cannot stringify circular structure without alias nodes`);
			else {
				if (ctx.resolvedAliases) ctx.resolvedAliases.add(item);
				else ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
				item = item.resolve(ctx.doc);
			}
		}
		let tagObj = void 0;
		const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
		tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
		const props = stringifyProps(node, tagObj, ctx);
		if (props.length > 0) ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
		const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
		if (!props) return str;
		return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}\n${ctx.indent}${str}`;
	}
	exports.createStringifyContext = createStringifyContext;
	exports.stringify = stringify;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Scalar = require_Scalar();
	var stringify = require_stringify();
	var stringifyComment = require_stringifyComment();
	function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
		const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
		let keyComment = identity.isNode(key) && key.comment || null;
		if (simpleKeys) {
			if (keyComment) throw new Error("With simple keys, key nodes cannot have comments");
			if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") throw new Error("With simple keys, collection cannot be used as a key value");
		}
		let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
		ctx = Object.assign({}, ctx, {
			allNullValues: false,
			implicitKey: !explicitKey && (simpleKeys || !allNullValues),
			indent: indent + indentStep
		});
		let keyCommentDone = false;
		let chompKeep = false;
		let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
		if (!explicitKey && !ctx.inFlow && str.length > 1024) {
			if (simpleKeys) throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
			explicitKey = true;
		}
		if (ctx.inFlow) {
			if (allNullValues || value == null) {
				if (keyCommentDone && onComment) onComment();
				return str === "" ? "?" : explicitKey ? `? ${str}` : str;
			}
		} else if (allNullValues && !simpleKeys || value == null && explicitKey) {
			str = `? ${str}`;
			if (keyComment && !keyCommentDone) str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
			else if (chompKeep && onChompKeep) onChompKeep();
			return str;
		}
		if (keyCommentDone) keyComment = null;
		if (explicitKey) {
			if (keyComment) str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
			str = `? ${str}\n${indent}:`;
		} else {
			str = `${str}:`;
			if (keyComment) str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
		}
		let vsb, vcb, valueComment;
		if (identity.isNode(value)) {
			vsb = !!value.spaceBefore;
			vcb = value.commentBefore;
			valueComment = value.comment;
		} else {
			vsb = false;
			vcb = null;
			valueComment = null;
			if (value && typeof value === "object") value = doc.createNode(value);
		}
		ctx.implicitKey = false;
		if (!explicitKey && !keyComment && identity.isScalar(value)) ctx.indentAtStart = str.length + 1;
		chompKeep = false;
		if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) ctx.indent = ctx.indent.substring(2);
		let valueCommentDone = false;
		const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
		let ws = " ";
		if (keyComment || vsb || vcb) {
			ws = vsb ? "\n" : "";
			if (vcb) {
				const cs = commentString(vcb);
				ws += `\n${stringifyComment.indentComment(cs, ctx.indent)}`;
			}
			if (valueStr === "" && !ctx.inFlow) {
				if (ws === "\n" && valueComment) ws = "\n\n";
			} else ws += `\n${ctx.indent}`;
		} else if (!explicitKey && identity.isCollection(value)) {
			const vs0 = valueStr[0];
			const nl0 = valueStr.indexOf("\n");
			const hasNewline = nl0 !== -1;
			const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
			if (hasNewline || !flow) {
				let hasPropsLine = false;
				if (hasNewline && (vs0 === "&" || vs0 === "!")) {
					let sp0 = valueStr.indexOf(" ");
					if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") sp0 = valueStr.indexOf(" ", sp0 + 1);
					if (sp0 === -1 || nl0 < sp0) hasPropsLine = true;
				}
				if (!hasPropsLine) ws = `\n${ctx.indent}`;
			}
		} else if (valueStr === "" || valueStr[0] === "\n") ws = "";
		str += ws + valueStr;
		if (ctx.inFlow) {
			if (valueCommentDone && onComment) onComment();
		} else if (valueComment && !valueCommentDone) str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
		else if (chompKeep && onChompKeep) onChompKeep();
		return str;
	}
	exports.stringifyPair = stringifyPair;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/log.js
var require_log = /* @__PURE__ */ __commonJSMin(((exports) => {
	var node_process$2 = __require("process");
	function debug(logLevel, ...messages) {
		if (logLevel === "debug") console.log(...messages);
	}
	function warn(logLevel, warning) {
		if (logLevel === "debug" || logLevel === "warn") {
			if (typeof node_process$2.emitWarning === "function") node_process$2.emitWarning(warning);
			else console.warn(warning);
		}
	}
	exports.debug = debug;
	exports.warn = warn;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Scalar = require_Scalar();
	const MERGE_KEY = "<<";
	const merge = {
		identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
		default: "key",
		tag: "tag:yaml.org,2002:merge",
		test: /^<<$/,
		resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), { addToJSMap: addMergeToJSMap }),
		stringify: () => MERGE_KEY
	};
	const isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
	function addMergeToJSMap(ctx, map, value) {
		const source = resolveAliasValue(ctx, value);
		if (identity.isSeq(source)) for (const it of source.items) mergeValue(ctx, map, it);
		else if (Array.isArray(source)) for (const it of source) mergeValue(ctx, map, it);
		else mergeValue(ctx, map, source);
	}
	function mergeValue(ctx, map, value) {
		const source = resolveAliasValue(ctx, value);
		if (!identity.isMap(source)) throw new Error("Merge sources must be maps or map aliases");
		const srcMap = source.toJSON(null, ctx, Map);
		for (const [key, value] of srcMap) if (map instanceof Map) {
			if (!map.has(key)) map.set(key, value);
		} else if (map instanceof Set) map.add(key);
		else if (!Object.prototype.hasOwnProperty.call(map, key)) Object.defineProperty(map, key, {
			value,
			writable: true,
			enumerable: true,
			configurable: true
		});
		return map;
	}
	function resolveAliasValue(ctx, value) {
		return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
	}
	exports.addMergeToJSMap = addMergeToJSMap;
	exports.isMergeKey = isMergeKey;
	exports.merge = merge;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = /* @__PURE__ */ __commonJSMin(((exports) => {
	var log = require_log();
	var merge = require_merge();
	var stringify = require_stringify();
	var identity = require_identity();
	var toJS = require_toJS();
	function addPairToJSMap(ctx, map, { key, value }) {
		if (identity.isNode(key) && key.addToJSMap) key.addToJSMap(ctx, map, value);
		else if (merge.isMergeKey(ctx, key)) merge.addMergeToJSMap(ctx, map, value);
		else {
			const jsKey = toJS.toJS(key, "", ctx);
			if (map instanceof Map) map.set(jsKey, toJS.toJS(value, jsKey, ctx));
			else if (map instanceof Set) map.add(jsKey);
			else {
				const stringKey = stringifyKey(key, jsKey, ctx);
				const jsValue = toJS.toJS(value, stringKey, ctx);
				if (stringKey in map) Object.defineProperty(map, stringKey, {
					value: jsValue,
					writable: true,
					enumerable: true,
					configurable: true
				});
				else map[stringKey] = jsValue;
			}
		}
		return map;
	}
	function stringifyKey(key, jsKey, ctx) {
		if (jsKey === null) return "";
		if (typeof jsKey !== "object") return String(jsKey);
		if (identity.isNode(key) && ctx?.doc) {
			const strCtx = stringify.createStringifyContext(ctx.doc, {});
			strCtx.anchors = /* @__PURE__ */ new Set();
			for (const node of ctx.anchors.keys()) strCtx.anchors.add(node.anchor);
			strCtx.inFlow = true;
			strCtx.inStringifyKey = true;
			const strKey = key.toString(strCtx);
			if (!ctx.mapKeyWarned) {
				let jsonStr = JSON.stringify(strKey);
				if (jsonStr.length > 40) jsonStr = jsonStr.substring(0, 36) + "...\"";
				log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
				ctx.mapKeyWarned = true;
			}
			return strKey;
		}
		return JSON.stringify(jsKey);
	}
	exports.addPairToJSMap = addPairToJSMap;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/nodes/Pair.js
var require_Pair = /* @__PURE__ */ __commonJSMin(((exports) => {
	var createNode = require_createNode();
	var stringifyPair = require_stringifyPair();
	var addPairToJSMap = require_addPairToJSMap();
	var identity = require_identity();
	function createPair(key, value, ctx) {
		return new Pair(createNode.createNode(key, void 0, ctx), createNode.createNode(value, void 0, ctx));
	}
	var Pair = class Pair {
		constructor(key, value = null) {
			Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
			this.key = key;
			this.value = value;
		}
		clone(schema) {
			let { key, value } = this;
			if (identity.isNode(key)) key = key.clone(schema);
			if (identity.isNode(value)) value = value.clone(schema);
			return new Pair(key, value);
		}
		toJSON(_, ctx) {
			const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
			return addPairToJSMap.addPairToJSMap(ctx, pair, this);
		}
		toString(ctx, onComment, onChompKeep) {
			return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
		}
	};
	exports.Pair = Pair;
	exports.createPair = createPair;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var stringify = require_stringify();
	var stringifyComment = require_stringifyComment();
	function stringifyCollection(collection, ctx, options) {
		return (ctx.inFlow ?? collection.flow ? stringifyFlowCollection : stringifyBlockCollection)(collection, ctx, options);
	}
	function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
		const { indent, options: { commentString } } = ctx;
		const itemCtx = Object.assign({}, ctx, {
			indent: itemIndent,
			type: null
		});
		let chompKeep = false;
		const lines = [];
		for (let i = 0; i < items.length; ++i) {
			const item = items[i];
			let comment = null;
			if (identity.isNode(item)) {
				if (!chompKeep && item.spaceBefore) lines.push("");
				addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
				if (item.comment) comment = item.comment;
			} else if (identity.isPair(item)) {
				const ik = identity.isNode(item.key) ? item.key : null;
				if (ik) {
					if (!chompKeep && ik.spaceBefore) lines.push("");
					addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
				}
			}
			chompKeep = false;
			let str = stringify.stringify(item, itemCtx, () => comment = null, () => chompKeep = true);
			if (comment) str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
			if (chompKeep && comment) chompKeep = false;
			lines.push(blockItemPrefix + str);
		}
		let str;
		if (lines.length === 0) str = flowChars.start + flowChars.end;
		else {
			str = lines[0];
			for (let i = 1; i < lines.length; ++i) {
				const line = lines[i];
				str += line ? `\n${indent}${line}` : "\n";
			}
		}
		if (comment) {
			str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
			if (onComment) onComment();
		} else if (chompKeep && onChompKeep) onChompKeep();
		return str;
	}
	function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
		const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
		itemIndent += indentStep;
		const itemCtx = Object.assign({}, ctx, {
			indent: itemIndent,
			inFlow: true,
			type: null
		});
		let reqNewline = false;
		let linesAtValue = 0;
		const lines = [];
		for (let i = 0; i < items.length; ++i) {
			const item = items[i];
			let comment = null;
			if (identity.isNode(item)) {
				if (item.spaceBefore) lines.push("");
				addCommentBefore(ctx, lines, item.commentBefore, false);
				if (item.comment) comment = item.comment;
			} else if (identity.isPair(item)) {
				const ik = identity.isNode(item.key) ? item.key : null;
				if (ik) {
					if (ik.spaceBefore) lines.push("");
					addCommentBefore(ctx, lines, ik.commentBefore, false);
					if (ik.comment) reqNewline = true;
				}
				const iv = identity.isNode(item.value) ? item.value : null;
				if (iv) {
					if (iv.comment) comment = iv.comment;
					if (iv.commentBefore) reqNewline = true;
				} else if (item.value == null && ik?.comment) comment = ik.comment;
			}
			if (comment) reqNewline = true;
			let str = stringify.stringify(item, itemCtx, () => comment = null);
			reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
			if (i < items.length - 1) str += ",";
			else if (ctx.options.trailingComma) {
				if (ctx.options.lineWidth > 0) reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
				if (reqNewline) str += ",";
			}
			if (comment) str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
			lines.push(str);
			linesAtValue = lines.length;
		}
		const { start, end } = flowChars;
		if (lines.length === 0) return start + end;
		else {
			if (!reqNewline) {
				const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
				reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
			}
			if (reqNewline) {
				let str = start;
				for (const line of lines) str += line ? `\n${indentStep}${indent}${line}` : "\n";
				return `${str}\n${indent}${end}`;
			} else return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
		}
	}
	function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
		if (comment && chompKeep) comment = comment.replace(/^\n+/, "");
		if (comment) {
			const ic = stringifyComment.indentComment(commentString(comment), indent);
			lines.push(ic.trimStart());
		}
	}
	exports.stringifyCollection = stringifyCollection;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = /* @__PURE__ */ __commonJSMin(((exports) => {
	var stringifyCollection = require_stringifyCollection();
	var addPairToJSMap = require_addPairToJSMap();
	var Collection = require_Collection();
	var identity = require_identity();
	var Pair = require_Pair();
	var Scalar = require_Scalar();
	function findPair(items, key) {
		const k = identity.isScalar(key) ? key.value : key;
		for (const it of items) if (identity.isPair(it)) {
			if (it.key === key || it.key === k) return it;
			if (identity.isScalar(it.key) && it.key.value === k) return it;
		}
	}
	var YAMLMap = class extends Collection.Collection {
		static get tagName() {
			return "tag:yaml.org,2002:map";
		}
		constructor(schema) {
			super(identity.MAP, schema);
			this.items = [];
		}
		/**
		* A generic collection parsing method that can be extended
		* to other node classes that inherit from YAMLMap
		*/
		static from(schema, obj, ctx) {
			const { keepUndefined, replacer } = ctx;
			const map = new this(schema);
			const add = (key, value) => {
				if (typeof replacer === "function") value = replacer.call(obj, key, value);
				else if (Array.isArray(replacer) && !replacer.includes(key)) return;
				if (value !== void 0 || keepUndefined) map.items.push(Pair.createPair(key, value, ctx));
			};
			if (obj instanceof Map) for (const [key, value] of obj) add(key, value);
			else if (obj && typeof obj === "object") for (const key of Object.keys(obj)) add(key, obj[key]);
			if (typeof schema.sortMapEntries === "function") map.items.sort(schema.sortMapEntries);
			return map;
		}
		/**
		* Adds a value to the collection.
		*
		* @param overwrite - If not set `true`, using a key that is already in the
		*   collection will throw. Otherwise, overwrites the previous value.
		*/
		add(pair, overwrite) {
			let _pair;
			if (identity.isPair(pair)) _pair = pair;
			else if (!pair || typeof pair !== "object" || !("key" in pair)) _pair = new Pair.Pair(pair, pair?.value);
			else _pair = new Pair.Pair(pair.key, pair.value);
			const prev = findPair(this.items, _pair.key);
			const sortEntries = this.schema?.sortMapEntries;
			if (prev) {
				if (!overwrite) throw new Error(`Key ${_pair.key} already set`);
				if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value)) prev.value.value = _pair.value;
				else prev.value = _pair.value;
			} else if (sortEntries) {
				const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
				if (i === -1) this.items.push(_pair);
				else this.items.splice(i, 0, _pair);
			} else this.items.push(_pair);
		}
		delete(key) {
			const it = findPair(this.items, key);
			if (!it) return false;
			return this.items.splice(this.items.indexOf(it), 1).length > 0;
		}
		get(key, keepScalar) {
			const node = findPair(this.items, key)?.value;
			return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
		}
		has(key) {
			return !!findPair(this.items, key);
		}
		set(key, value) {
			this.add(new Pair.Pair(key, value), true);
		}
		/**
		* @param ctx - Conversion context, originally set in Document#toJS()
		* @param {Class} Type - If set, forces the returned collection type
		* @returns Instance of Type, Map, or Object
		*/
		toJSON(_, ctx, Type) {
			const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
			if (ctx?.onCreate) ctx.onCreate(map);
			for (const item of this.items) addPairToJSMap.addPairToJSMap(ctx, map, item);
			return map;
		}
		toString(ctx, onComment, onChompKeep) {
			if (!ctx) return JSON.stringify(this);
			for (const item of this.items) if (!identity.isPair(item)) throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
			if (!ctx.allNullValues && this.hasAllNullValues(false)) ctx = Object.assign({}, ctx, { allNullValues: true });
			return stringifyCollection.stringifyCollection(this, ctx, {
				blockItemPrefix: "",
				flowChars: {
					start: "{",
					end: "}"
				},
				itemIndent: ctx.indent || "",
				onChompKeep,
				onComment
			});
		}
	};
	exports.YAMLMap = YAMLMap;
	exports.findPair = findPair;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/common/map.js
var require_map = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var YAMLMap = require_YAMLMap();
	exports.map = {
		collection: "map",
		default: true,
		nodeClass: YAMLMap.YAMLMap,
		tag: "tag:yaml.org,2002:map",
		resolve(map, onError) {
			if (!identity.isMap(map)) onError("Expected a mapping for this tag");
			return map;
		},
		createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
	};
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = /* @__PURE__ */ __commonJSMin(((exports) => {
	var createNode = require_createNode();
	var stringifyCollection = require_stringifyCollection();
	var Collection = require_Collection();
	var identity = require_identity();
	var Scalar = require_Scalar();
	var toJS = require_toJS();
	var YAMLSeq = class extends Collection.Collection {
		static get tagName() {
			return "tag:yaml.org,2002:seq";
		}
		constructor(schema) {
			super(identity.SEQ, schema);
			this.items = [];
		}
		add(value) {
			this.items.push(value);
		}
		/**
		* Removes a value from the collection.
		*
		* `key` must contain a representation of an integer for this to succeed.
		* It may be wrapped in a `Scalar`.
		*
		* @returns `true` if the item was found and removed.
		*/
		delete(key) {
			const idx = asItemIndex(key);
			if (typeof idx !== "number") return false;
			return this.items.splice(idx, 1).length > 0;
		}
		get(key, keepScalar) {
			const idx = asItemIndex(key);
			if (typeof idx !== "number") return void 0;
			const it = this.items[idx];
			return !keepScalar && identity.isScalar(it) ? it.value : it;
		}
		/**
		* Checks if the collection includes a value with the key `key`.
		*
		* `key` must contain a representation of an integer for this to succeed.
		* It may be wrapped in a `Scalar`.
		*/
		has(key) {
			const idx = asItemIndex(key);
			return typeof idx === "number" && idx < this.items.length;
		}
		/**
		* Sets a value in this collection. For `!!set`, `value` needs to be a
		* boolean to add/remove the item from the set.
		*
		* If `key` does not contain a representation of an integer, this will throw.
		* It may be wrapped in a `Scalar`.
		*/
		set(key, value) {
			const idx = asItemIndex(key);
			if (typeof idx !== "number") throw new Error(`Expected a valid index, not ${key}.`);
			const prev = this.items[idx];
			if (identity.isScalar(prev) && Scalar.isScalarValue(value)) prev.value = value;
			else this.items[idx] = value;
		}
		toJSON(_, ctx) {
			const seq = [];
			if (ctx?.onCreate) ctx.onCreate(seq);
			let i = 0;
			for (const item of this.items) seq.push(toJS.toJS(item, String(i++), ctx));
			return seq;
		}
		toString(ctx, onComment, onChompKeep) {
			if (!ctx) return JSON.stringify(this);
			return stringifyCollection.stringifyCollection(this, ctx, {
				blockItemPrefix: "- ",
				flowChars: {
					start: "[",
					end: "]"
				},
				itemIndent: (ctx.indent || "") + "  ",
				onChompKeep,
				onComment
			});
		}
		static from(schema, obj, ctx) {
			const { replacer } = ctx;
			const seq = new this(schema);
			if (obj && Symbol.iterator in Object(obj)) {
				let i = 0;
				for (let it of obj) {
					if (typeof replacer === "function") {
						const key = obj instanceof Set ? it : String(i++);
						it = replacer.call(obj, key, it);
					}
					seq.items.push(createNode.createNode(it, void 0, ctx));
				}
			}
			return seq;
		}
	};
	function asItemIndex(key) {
		let idx = identity.isScalar(key) ? key.value : key;
		if (idx && typeof idx === "string") idx = Number(idx);
		return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
	}
	exports.YAMLSeq = YAMLSeq;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/common/seq.js
var require_seq = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var YAMLSeq = require_YAMLSeq();
	exports.seq = {
		collection: "seq",
		default: true,
		nodeClass: YAMLSeq.YAMLSeq,
		tag: "tag:yaml.org,2002:seq",
		resolve(seq, onError) {
			if (!identity.isSeq(seq)) onError("Expected a sequence for this tag");
			return seq;
		},
		createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
	};
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/common/string.js
var require_string = /* @__PURE__ */ __commonJSMin(((exports) => {
	var stringifyString = require_stringifyString();
	exports.string = {
		identify: (value) => typeof value === "string",
		default: true,
		tag: "tag:yaml.org,2002:str",
		resolve: (str) => str,
		stringify(item, ctx, onComment, onChompKeep) {
			ctx = Object.assign({ actualString: true }, ctx);
			return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
		}
	};
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/common/null.js
var require_null = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	const nullTag = {
		identify: (value) => value == null,
		createNode: () => new Scalar.Scalar(null),
		default: true,
		tag: "tag:yaml.org,2002:null",
		test: /^(?:~|[Nn]ull|NULL)?$/,
		resolve: () => new Scalar.Scalar(null),
		stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
	};
	exports.nullTag = nullTag;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/core/bool.js
var require_bool$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	const boolTag = {
		identify: (value) => typeof value === "boolean",
		default: true,
		tag: "tag:yaml.org,2002:bool",
		test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
		resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
		stringify({ source, value }, ctx) {
			if (source && boolTag.test.test(source)) {
				if (value === (source[0] === "t" || source[0] === "T")) return source;
			}
			return value ? ctx.options.trueStr : ctx.options.falseStr;
		}
	};
	exports.boolTag = boolTag;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = /* @__PURE__ */ __commonJSMin(((exports) => {
	function stringifyNumber({ format, minFractionDigits, tag, value }) {
		if (typeof value === "bigint") return String(value);
		const num = typeof value === "number" ? value : Number(value);
		if (!isFinite(num)) return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
		let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
		if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
			let i = n.indexOf(".");
			if (i < 0) {
				i = n.length;
				n += ".";
			}
			let d = minFractionDigits - (n.length - i - 1);
			while (d-- > 0) n += "0";
		}
		return n;
	}
	exports.stringifyNumber = stringifyNumber;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/core/float.js
var require_float$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	var stringifyNumber = require_stringifyNumber();
	const floatNaN = {
		identify: (value) => typeof value === "number",
		default: true,
		tag: "tag:yaml.org,2002:float",
		test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
		resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
		stringify: stringifyNumber.stringifyNumber
	};
	const floatExp = {
		identify: (value) => typeof value === "number",
		default: true,
		tag: "tag:yaml.org,2002:float",
		format: "EXP",
		test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
		resolve: (str) => parseFloat(str),
		stringify(node) {
			const num = Number(node.value);
			return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
		}
	};
	exports.float = {
		identify: (value) => typeof value === "number",
		default: true,
		tag: "tag:yaml.org,2002:float",
		test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
		resolve(str) {
			const node = new Scalar.Scalar(parseFloat(str));
			const dot = str.indexOf(".");
			if (dot !== -1 && str[str.length - 1] === "0") node.minFractionDigits = str.length - dot - 1;
			return node;
		},
		stringify: stringifyNumber.stringifyNumber
	};
	exports.floatExp = floatExp;
	exports.floatNaN = floatNaN;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/core/int.js
var require_int$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var stringifyNumber = require_stringifyNumber();
	const intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
	const intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
	function intStringify(node, radix, prefix) {
		const { value } = node;
		if (intIdentify(value) && value >= 0) return prefix + value.toString(radix);
		return stringifyNumber.stringifyNumber(node);
	}
	const intOct = {
		identify: (value) => intIdentify(value) && value >= 0,
		default: true,
		tag: "tag:yaml.org,2002:int",
		format: "OCT",
		test: /^0o[0-7]+$/,
		resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
		stringify: (node) => intStringify(node, 8, "0o")
	};
	const int = {
		identify: intIdentify,
		default: true,
		tag: "tag:yaml.org,2002:int",
		test: /^[-+]?[0-9]+$/,
		resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
		stringify: stringifyNumber.stringifyNumber
	};
	const intHex = {
		identify: (value) => intIdentify(value) && value >= 0,
		default: true,
		tag: "tag:yaml.org,2002:int",
		format: "HEX",
		test: /^0x[0-9a-fA-F]+$/,
		resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
		stringify: (node) => intStringify(node, 16, "0x")
	};
	exports.int = int;
	exports.intHex = intHex;
	exports.intOct = intOct;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/core/schema.js
var require_schema$2 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var map = require_map();
	var _null = require_null();
	var seq = require_seq();
	var string = require_string();
	var bool = require_bool$1();
	var float = require_float$1();
	var int = require_int$1();
	exports.schema = [
		map.map,
		seq.seq,
		string.string,
		_null.nullTag,
		bool.boolTag,
		int.intOct,
		int.int,
		int.intHex,
		float.floatNaN,
		float.floatExp,
		float.float
	];
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/json/schema.js
var require_schema$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	var map = require_map();
	var seq = require_seq();
	function intIdentify(value) {
		return typeof value === "bigint" || Number.isInteger(value);
	}
	const stringifyJSON = ({ value }) => JSON.stringify(value);
	const jsonScalars = [
		{
			identify: (value) => typeof value === "string",
			default: true,
			tag: "tag:yaml.org,2002:str",
			resolve: (str) => str,
			stringify: stringifyJSON
		},
		{
			identify: (value) => value == null,
			createNode: () => new Scalar.Scalar(null),
			default: true,
			tag: "tag:yaml.org,2002:null",
			test: /^null$/,
			resolve: () => null,
			stringify: stringifyJSON
		},
		{
			identify: (value) => typeof value === "boolean",
			default: true,
			tag: "tag:yaml.org,2002:bool",
			test: /^true$|^false$/,
			resolve: (str) => str === "true",
			stringify: stringifyJSON
		},
		{
			identify: intIdentify,
			default: true,
			tag: "tag:yaml.org,2002:int",
			test: /^-?(?:0|[1-9][0-9]*)$/,
			resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
			stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
		},
		{
			identify: (value) => typeof value === "number",
			default: true,
			tag: "tag:yaml.org,2002:float",
			test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
			resolve: (str) => parseFloat(str),
			stringify: stringifyJSON
		}
	];
	exports.schema = [map.map, seq.seq].concat(jsonScalars, {
		default: true,
		tag: "",
		test: /^/,
		resolve(str, onError) {
			onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
			return str;
		}
	});
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = /* @__PURE__ */ __commonJSMin(((exports) => {
	var node_buffer = __require("buffer");
	var Scalar = require_Scalar();
	var stringifyString = require_stringifyString();
	exports.binary = {
		identify: (value) => value instanceof Uint8Array,
		default: false,
		tag: "tag:yaml.org,2002:binary",
		/**
		* Returns a Buffer in node and an Uint8Array in browsers
		*
		* To use the resulting buffer as an image, you'll want to do something like:
		*
		*   const blob = new Blob([buffer], { type: 'image/jpeg' })
		*   document.querySelector('#photo').src = URL.createObjectURL(blob)
		*/
		resolve(src, onError) {
			if (typeof node_buffer.Buffer === "function") return node_buffer.Buffer.from(src, "base64");
			else if (typeof atob === "function") {
				const str = atob(src.replace(/[\n\r]/g, ""));
				const buffer = new Uint8Array(str.length);
				for (let i = 0; i < str.length; ++i) buffer[i] = str.charCodeAt(i);
				return buffer;
			} else {
				onError("This environment does not support reading binary tags; either Buffer or atob is required");
				return src;
			}
		},
		stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
			if (!value) return "";
			const buf = value;
			let str;
			if (typeof node_buffer.Buffer === "function") str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
			else if (typeof btoa === "function") {
				let s = "";
				for (let i = 0; i < buf.length; ++i) s += String.fromCharCode(buf[i]);
				str = btoa(s);
			} else throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
			type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
			if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
				const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
				const n = Math.ceil(str.length / lineWidth);
				const lines = new Array(n);
				for (let i = 0, o = 0; i < n; ++i, o += lineWidth) lines[i] = str.substr(o, lineWidth);
				str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
			}
			return stringifyString.stringifyString({
				comment,
				type,
				value: str
			}, ctx, onComment, onChompKeep);
		}
	};
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Pair = require_Pair();
	var Scalar = require_Scalar();
	var YAMLSeq = require_YAMLSeq();
	function resolvePairs(seq, onError) {
		if (identity.isSeq(seq)) for (let i = 0; i < seq.items.length; ++i) {
			let item = seq.items[i];
			if (identity.isPair(item)) continue;
			else if (identity.isMap(item)) {
				if (item.items.length > 1) onError("Each pair must have its own sequence indicator");
				const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
				if (item.commentBefore) pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}\n${pair.key.commentBefore}` : item.commentBefore;
				if (item.comment) {
					const cn = pair.value ?? pair.key;
					cn.comment = cn.comment ? `${item.comment}\n${cn.comment}` : item.comment;
				}
				item = pair;
			}
			seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
		}
		else onError("Expected a sequence for this tag");
		return seq;
	}
	function createPairs(schema, iterable, ctx) {
		const { replacer } = ctx;
		const pairs = new YAMLSeq.YAMLSeq(schema);
		pairs.tag = "tag:yaml.org,2002:pairs";
		let i = 0;
		if (iterable && Symbol.iterator in Object(iterable)) for (let it of iterable) {
			if (typeof replacer === "function") it = replacer.call(iterable, String(i++), it);
			let key, value;
			if (Array.isArray(it)) {
				if (it.length === 2) {
					key = it[0];
					value = it[1];
				} else throw new TypeError(`Expected [key, value] tuple: ${it}`);
			} else if (it && it instanceof Object) {
				const keys = Object.keys(it);
				if (keys.length === 1) {
					key = keys[0];
					value = it[key];
				} else throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
			} else key = it;
			pairs.items.push(Pair.createPair(key, value, ctx));
		}
		return pairs;
	}
	const pairs = {
		collection: "seq",
		default: false,
		tag: "tag:yaml.org,2002:pairs",
		resolve: resolvePairs,
		createNode: createPairs
	};
	exports.createPairs = createPairs;
	exports.pairs = pairs;
	exports.resolvePairs = resolvePairs;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var toJS = require_toJS();
	var YAMLMap = require_YAMLMap();
	var YAMLSeq = require_YAMLSeq();
	var pairs = require_pairs();
	var YAMLOMap = class YAMLOMap extends YAMLSeq.YAMLSeq {
		constructor() {
			super();
			this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
			this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
			this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
			this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
			this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
			this.tag = YAMLOMap.tag;
		}
		/**
		* If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
		* but TypeScript won't allow widening the signature of a child method.
		*/
		toJSON(_, ctx) {
			if (!ctx) return super.toJSON(_);
			const map = /* @__PURE__ */ new Map();
			if (ctx?.onCreate) ctx.onCreate(map);
			for (const pair of this.items) {
				let key, value;
				if (identity.isPair(pair)) {
					key = toJS.toJS(pair.key, "", ctx);
					value = toJS.toJS(pair.value, key, ctx);
				} else key = toJS.toJS(pair, "", ctx);
				if (map.has(key)) throw new Error("Ordered maps must not include duplicate keys");
				map.set(key, value);
			}
			return map;
		}
		static from(schema, iterable, ctx) {
			const pairs$1 = pairs.createPairs(schema, iterable, ctx);
			const omap = new this();
			omap.items = pairs$1.items;
			return omap;
		}
	};
	YAMLOMap.tag = "tag:yaml.org,2002:omap";
	const omap = {
		collection: "seq",
		identify: (value) => value instanceof Map,
		nodeClass: YAMLOMap,
		default: false,
		tag: "tag:yaml.org,2002:omap",
		resolve(seq, onError) {
			const pairs$1 = pairs.resolvePairs(seq, onError);
			const seenKeys = [];
			for (const { key } of pairs$1.items) if (identity.isScalar(key)) {
				if (seenKeys.includes(key.value)) onError(`Ordered maps must not include duplicate keys: ${key.value}`);
				else seenKeys.push(key.value);
			}
			return Object.assign(new YAMLOMap(), pairs$1);
		},
		createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
	};
	exports.YAMLOMap = YAMLOMap;
	exports.omap = omap;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	function boolStringify({ value, source }, ctx) {
		if (source && (value ? trueTag : falseTag).test.test(source)) return source;
		return value ? ctx.options.trueStr : ctx.options.falseStr;
	}
	const trueTag = {
		identify: (value) => value === true,
		default: true,
		tag: "tag:yaml.org,2002:bool",
		test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
		resolve: () => new Scalar.Scalar(true),
		stringify: boolStringify
	};
	const falseTag = {
		identify: (value) => value === false,
		default: true,
		tag: "tag:yaml.org,2002:bool",
		test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
		resolve: () => new Scalar.Scalar(false),
		stringify: boolStringify
	};
	exports.falseTag = falseTag;
	exports.trueTag = trueTag;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	var stringifyNumber = require_stringifyNumber();
	const floatNaN = {
		identify: (value) => typeof value === "number",
		default: true,
		tag: "tag:yaml.org,2002:float",
		test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
		resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
		stringify: stringifyNumber.stringifyNumber
	};
	const floatExp = {
		identify: (value) => typeof value === "number",
		default: true,
		tag: "tag:yaml.org,2002:float",
		format: "EXP",
		test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
		resolve: (str) => parseFloat(str.replace(/_/g, "")),
		stringify(node) {
			const num = Number(node.value);
			return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
		}
	};
	exports.float = {
		identify: (value) => typeof value === "number",
		default: true,
		tag: "tag:yaml.org,2002:float",
		test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
		resolve(str) {
			const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
			const dot = str.indexOf(".");
			if (dot !== -1) {
				const f = str.substring(dot + 1).replace(/_/g, "");
				if (f[f.length - 1] === "0") node.minFractionDigits = f.length;
			}
			return node;
		},
		stringify: stringifyNumber.stringifyNumber
	};
	exports.floatExp = floatExp;
	exports.floatNaN = floatNaN;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int = /* @__PURE__ */ __commonJSMin(((exports) => {
	var stringifyNumber = require_stringifyNumber();
	const intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
	function intResolve(str, offset, radix, { intAsBigInt }) {
		const sign = str[0];
		if (sign === "-" || sign === "+") offset += 1;
		str = str.substring(offset).replace(/_/g, "");
		if (intAsBigInt) {
			switch (radix) {
				case 2:
					str = `0b${str}`;
					break;
				case 8:
					str = `0o${str}`;
					break;
				case 16: str = `0x${str}`;
			}
			const n = BigInt(str);
			return sign === "-" ? BigInt(-1) * n : n;
		}
		const n = parseInt(str, radix);
		return sign === "-" ? -1 * n : n;
	}
	function intStringify(node, radix, prefix) {
		const { value } = node;
		if (intIdentify(value)) {
			const str = value.toString(radix);
			return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
		}
		return stringifyNumber.stringifyNumber(node);
	}
	const intBin = {
		identify: intIdentify,
		default: true,
		tag: "tag:yaml.org,2002:int",
		format: "BIN",
		test: /^[-+]?0b[0-1_]+$/,
		resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
		stringify: (node) => intStringify(node, 2, "0b")
	};
	const intOct = {
		identify: intIdentify,
		default: true,
		tag: "tag:yaml.org,2002:int",
		format: "OCT",
		test: /^[-+]?0[0-7_]+$/,
		resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
		stringify: (node) => intStringify(node, 8, "0")
	};
	const int = {
		identify: intIdentify,
		default: true,
		tag: "tag:yaml.org,2002:int",
		test: /^[-+]?[0-9][0-9_]*$/,
		resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
		stringify: stringifyNumber.stringifyNumber
	};
	const intHex = {
		identify: intIdentify,
		default: true,
		tag: "tag:yaml.org,2002:int",
		format: "HEX",
		test: /^[-+]?0x[0-9a-fA-F_]+$/,
		resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
		stringify: (node) => intStringify(node, 16, "0x")
	};
	exports.int = int;
	exports.intBin = intBin;
	exports.intHex = intHex;
	exports.intOct = intOct;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Pair = require_Pair();
	var YAMLMap = require_YAMLMap();
	var YAMLSet = class YAMLSet extends YAMLMap.YAMLMap {
		constructor(schema) {
			super(schema);
			this.tag = YAMLSet.tag;
		}
		add(key) {
			let pair;
			if (identity.isPair(key)) pair = key;
			else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null) pair = new Pair.Pair(key.key, null);
			else pair = new Pair.Pair(key, null);
			if (!YAMLMap.findPair(this.items, pair.key)) this.items.push(pair);
		}
		/**
		* If `keepPair` is `true`, returns the Pair matching `key`.
		* Otherwise, returns the value of that Pair's key.
		*/
		get(key, keepPair) {
			const pair = YAMLMap.findPair(this.items, key);
			return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
		}
		set(key, value) {
			if (typeof value !== "boolean") throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
			const prev = YAMLMap.findPair(this.items, key);
			if (prev && !value) this.items.splice(this.items.indexOf(prev), 1);
			else if (!prev && value) this.items.push(new Pair.Pair(key));
		}
		toJSON(_, ctx) {
			return super.toJSON(_, ctx, Set);
		}
		toString(ctx, onComment, onChompKeep) {
			if (!ctx) return JSON.stringify(this);
			if (this.hasAllNullValues(true)) return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
			else throw new Error("Set items must all have null values");
		}
		static from(schema, iterable, ctx) {
			const { replacer } = ctx;
			const set = new this(schema);
			if (iterable && Symbol.iterator in Object(iterable)) for (let value of iterable) {
				if (typeof replacer === "function") value = replacer.call(iterable, value, value);
				set.items.push(Pair.createPair(value, null, ctx));
			}
			return set;
		}
	};
	YAMLSet.tag = "tag:yaml.org,2002:set";
	const set = {
		collection: "map",
		identify: (value) => value instanceof Set,
		nodeClass: YAMLSet,
		default: false,
		tag: "tag:yaml.org,2002:set",
		createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
		resolve(map, onError) {
			if (identity.isMap(map)) {
				if (map.hasAllNullValues(true)) return Object.assign(new YAMLSet(), map);
				else onError("Set items must all have null values");
			} else onError("Expected a mapping for this tag");
			return map;
		}
	};
	exports.YAMLSet = YAMLSet;
	exports.set = set;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = /* @__PURE__ */ __commonJSMin(((exports) => {
	var stringifyNumber = require_stringifyNumber();
	/** Internal types handle bigint as number, because TS can't figure it out. */
	function parseSexagesimal(str, asBigInt) {
		const sign = str[0];
		const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
		const num = (n) => asBigInt ? BigInt(n) : Number(n);
		const res = parts.replace(/_/g, "").split(":").reduce((res, p) => res * num(60) + num(p), num(0));
		return sign === "-" ? num(-1) * res : res;
	}
	/**
	* hhhh:mm:ss.sss
	*
	* Internal types handle bigint as number, because TS can't figure it out.
	*/
	function stringifySexagesimal(node) {
		let { value } = node;
		let num = (n) => n;
		if (typeof value === "bigint") num = (n) => BigInt(n);
		else if (isNaN(value) || !isFinite(value)) return stringifyNumber.stringifyNumber(node);
		let sign = "";
		if (value < 0) {
			sign = "-";
			value *= num(-1);
		}
		const _60 = num(60);
		const parts = [value % _60];
		if (value < 60) parts.unshift(0);
		else {
			value = (value - parts[0]) / _60;
			parts.unshift(value % _60);
			if (value >= 60) {
				value = (value - parts[0]) / _60;
				parts.unshift(value);
			}
		}
		return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
	}
	const intTime = {
		identify: (value) => typeof value === "bigint" || Number.isInteger(value),
		default: true,
		tag: "tag:yaml.org,2002:int",
		format: "TIME",
		test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
		resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
		stringify: stringifySexagesimal
	};
	const floatTime = {
		identify: (value) => typeof value === "number",
		default: true,
		tag: "tag:yaml.org,2002:float",
		format: "TIME",
		test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
		resolve: (str) => parseSexagesimal(str, false),
		stringify: stringifySexagesimal
	};
	const timestamp = {
		identify: (value) => value instanceof Date,
		default: true,
		tag: "tag:yaml.org,2002:timestamp",
		test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
		resolve(str) {
			const match = str.match(timestamp.test);
			if (!match) throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
			const [, year, month, day, hour, minute, second] = match.map(Number);
			const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
			let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
			const tz = match[8];
			if (tz && tz !== "Z") {
				let d = parseSexagesimal(tz, false);
				if (Math.abs(d) < 30) d *= 60;
				date -= 6e4 * d;
			}
			return new Date(date);
		},
		stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
	};
	exports.floatTime = floatTime;
	exports.intTime = intTime;
	exports.timestamp = timestamp;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema = /* @__PURE__ */ __commonJSMin(((exports) => {
	var map = require_map();
	var _null = require_null();
	var seq = require_seq();
	var string = require_string();
	var binary = require_binary();
	var bool = require_bool();
	var float = require_float();
	var int = require_int();
	var merge = require_merge();
	var omap = require_omap();
	var pairs = require_pairs();
	var set = require_set();
	var timestamp = require_timestamp();
	exports.schema = [
		map.map,
		seq.seq,
		string.string,
		_null.nullTag,
		bool.trueTag,
		bool.falseTag,
		int.intBin,
		int.intOct,
		int.int,
		int.intHex,
		float.floatNaN,
		float.floatExp,
		float.float,
		binary.binary,
		merge.merge,
		omap.omap,
		pairs.pairs,
		set.set,
		timestamp.intTime,
		timestamp.floatTime,
		timestamp.timestamp
	];
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/tags.js
var require_tags = /* @__PURE__ */ __commonJSMin(((exports) => {
	var map = require_map();
	var _null = require_null();
	var seq = require_seq();
	var string = require_string();
	var bool = require_bool$1();
	var float = require_float$1();
	var int = require_int$1();
	var schema = require_schema$2();
	var schema$1 = require_schema$1();
	var binary = require_binary();
	var merge = require_merge();
	var omap = require_omap();
	var pairs = require_pairs();
	var schema$2 = require_schema();
	var set = require_set();
	var timestamp = require_timestamp();
	const schemas = /* @__PURE__ */ new Map([
		["core", schema.schema],
		["failsafe", [
			map.map,
			seq.seq,
			string.string
		]],
		["json", schema$1.schema],
		["yaml11", schema$2.schema],
		["yaml-1.1", schema$2.schema]
	]);
	const tagsByName = {
		binary: binary.binary,
		bool: bool.boolTag,
		float: float.float,
		floatExp: float.floatExp,
		floatNaN: float.floatNaN,
		floatTime: timestamp.floatTime,
		int: int.int,
		intHex: int.intHex,
		intOct: int.intOct,
		intTime: timestamp.intTime,
		map: map.map,
		merge: merge.merge,
		null: _null.nullTag,
		omap: omap.omap,
		pairs: pairs.pairs,
		seq: seq.seq,
		set: set.set,
		timestamp: timestamp.timestamp
	};
	const coreKnownTags = {
		"tag:yaml.org,2002:binary": binary.binary,
		"tag:yaml.org,2002:merge": merge.merge,
		"tag:yaml.org,2002:omap": omap.omap,
		"tag:yaml.org,2002:pairs": pairs.pairs,
		"tag:yaml.org,2002:set": set.set,
		"tag:yaml.org,2002:timestamp": timestamp.timestamp
	};
	function getTags(customTags, schemaName, addMergeTag) {
		const schemaTags = schemas.get(schemaName);
		if (schemaTags && !customTags) return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
		let tags = schemaTags;
		if (!tags) {
			if (Array.isArray(customTags)) tags = [];
			else {
				const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
				throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
			}
		}
		if (Array.isArray(customTags)) for (const tag of customTags) tags = tags.concat(tag);
		else if (typeof customTags === "function") tags = customTags(tags.slice());
		if (addMergeTag) tags = tags.concat(merge.merge);
		return tags.reduce((tags, tag) => {
			const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
			if (!tagObj) {
				const tagName = JSON.stringify(tag);
				const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
				throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
			}
			if (!tags.includes(tagObj)) tags.push(tagObj);
			return tags;
		}, []);
	}
	exports.coreKnownTags = coreKnownTags;
	exports.getTags = getTags;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/schema/Schema.js
var require_Schema = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var map = require_map();
	var seq = require_seq();
	var string = require_string();
	var tags = require_tags();
	const sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
	exports.Schema = class Schema {
		constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
			this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
			this.name = typeof schema === "string" && schema || "core";
			this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
			this.tags = tags.getTags(customTags, this.name, merge);
			this.toStringOptions = toStringDefaults ?? null;
			Object.defineProperty(this, identity.MAP, { value: map.map });
			Object.defineProperty(this, identity.SCALAR, { value: string.string });
			Object.defineProperty(this, identity.SEQ, { value: seq.seq });
			this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
		}
		clone() {
			const copy = Object.create(Schema.prototype, Object.getOwnPropertyDescriptors(this));
			copy.tags = this.tags.slice();
			return copy;
		}
	};
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var stringify = require_stringify();
	var stringifyComment = require_stringifyComment();
	function stringifyDocument(doc, options) {
		const lines = [];
		let hasDirectives = options.directives === true;
		if (options.directives !== false && doc.directives) {
			const dir = doc.directives.toString(doc);
			if (dir) {
				lines.push(dir);
				hasDirectives = true;
			} else if (doc.directives.docStart) hasDirectives = true;
		}
		if (hasDirectives) lines.push("---");
		const ctx = stringify.createStringifyContext(doc, options);
		const { commentString } = ctx.options;
		if (doc.commentBefore) {
			if (lines.length !== 1) lines.unshift("");
			const cs = commentString(doc.commentBefore);
			lines.unshift(stringifyComment.indentComment(cs, ""));
		}
		let chompKeep = false;
		let contentComment = null;
		if (doc.contents) {
			if (identity.isNode(doc.contents)) {
				if (doc.contents.spaceBefore && hasDirectives) lines.push("");
				if (doc.contents.commentBefore) {
					const cs = commentString(doc.contents.commentBefore);
					lines.push(stringifyComment.indentComment(cs, ""));
				}
				ctx.forceBlockIndent = !!doc.comment;
				contentComment = doc.contents.comment;
			}
			const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
			let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
			if (contentComment) body += stringifyComment.lineComment(body, "", commentString(contentComment));
			if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") lines[lines.length - 1] = `--- ${body}`;
			else lines.push(body);
		} else lines.push(stringify.stringify(doc.contents, ctx));
		if (doc.directives?.docEnd) {
			if (doc.comment) {
				const cs = commentString(doc.comment);
				if (cs.includes("\n")) {
					lines.push("...");
					lines.push(stringifyComment.indentComment(cs, ""));
				} else lines.push(`... ${cs}`);
			} else lines.push("...");
		} else {
			let dc = doc.comment;
			if (dc && chompKeep) dc = dc.replace(/^\n+/, "");
			if (dc) {
				if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "") lines.push("");
				lines.push(stringifyComment.indentComment(commentString(dc), ""));
			}
		}
		return lines.join("\n") + "\n";
	}
	exports.stringifyDocument = stringifyDocument;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/doc/Document.js
var require_Document = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Alias = require_Alias();
	var Collection = require_Collection();
	var identity = require_identity();
	var Pair = require_Pair();
	var toJS = require_toJS();
	var Schema = require_Schema();
	var stringifyDocument = require_stringifyDocument();
	var anchors = require_anchors();
	var applyReviver = require_applyReviver();
	var createNode = require_createNode();
	var directives = require_directives();
	var Document = class Document {
		constructor(value, replacer, options) {
			/** A comment before this Document */
			this.commentBefore = null;
			/** A comment immediately after this Document */
			this.comment = null;
			/** Errors encountered during parsing. */
			this.errors = [];
			/** Warnings encountered during parsing. */
			this.warnings = [];
			Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
			let _replacer = null;
			if (typeof replacer === "function" || Array.isArray(replacer)) _replacer = replacer;
			else if (options === void 0 && replacer) {
				options = replacer;
				replacer = void 0;
			}
			const opt = Object.assign({
				intAsBigInt: false,
				keepSourceTokens: false,
				logLevel: "warn",
				prettyErrors: true,
				strict: true,
				stringKeys: false,
				uniqueKeys: true,
				version: "1.2"
			}, options);
			this.options = opt;
			let { version } = opt;
			if (options?._directives) {
				this.directives = options._directives.atDocument();
				if (this.directives.yaml.explicit) version = this.directives.yaml.version;
			} else this.directives = new directives.Directives({ version });
			this.setSchema(version, options);
			this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
		}
		/**
		* Create a deep copy of this Document and its contents.
		*
		* Custom Node values that inherit from `Object` still refer to their original instances.
		*/
		clone() {
			const copy = Object.create(Document.prototype, { [identity.NODE_TYPE]: { value: identity.DOC } });
			copy.commentBefore = this.commentBefore;
			copy.comment = this.comment;
			copy.errors = this.errors.slice();
			copy.warnings = this.warnings.slice();
			copy.options = Object.assign({}, this.options);
			if (this.directives) copy.directives = this.directives.clone();
			copy.schema = this.schema.clone();
			copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
			if (this.range) copy.range = this.range.slice();
			return copy;
		}
		/** Adds a value to the document. */
		add(value) {
			if (assertCollection(this.contents)) this.contents.add(value);
		}
		/** Adds a value to the document. */
		addIn(path, value) {
			if (assertCollection(this.contents)) this.contents.addIn(path, value);
		}
		/**
		* Create a new `Alias` node, ensuring that the target `node` has the required anchor.
		*
		* If `node` already has an anchor, `name` is ignored.
		* Otherwise, the `node.anchor` value will be set to `name`,
		* or if an anchor with that name is already present in the document,
		* `name` will be used as a prefix for a new unique anchor.
		* If `name` is undefined, the generated anchor will use 'a' as a prefix.
		*/
		createAlias(node, name) {
			if (!node.anchor) {
				const prev = anchors.anchorNames(this);
				node.anchor = !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
			}
			return new Alias.Alias(node.anchor);
		}
		createNode(value, replacer, options) {
			let _replacer = void 0;
			if (typeof replacer === "function") {
				value = replacer.call({ "": value }, "", value);
				_replacer = replacer;
			} else if (Array.isArray(replacer)) {
				const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
				const asStr = replacer.filter(keyToStr).map(String);
				if (asStr.length > 0) replacer = replacer.concat(asStr);
				_replacer = replacer;
			} else if (options === void 0 && replacer) {
				options = replacer;
				replacer = void 0;
			}
			const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
			const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(this, anchorPrefix || "a");
			const ctx = {
				aliasDuplicateObjects: aliasDuplicateObjects ?? true,
				keepUndefined: keepUndefined ?? false,
				onAnchor,
				onTagObj,
				replacer: _replacer,
				schema: this.schema,
				sourceObjects
			};
			const node = createNode.createNode(value, tag, ctx);
			if (flow && identity.isCollection(node)) node.flow = true;
			setAnchors();
			return node;
		}
		/**
		* Convert a key and a value into a `Pair` using the current schema,
		* recursively wrapping all values as `Scalar` or `Collection` nodes.
		*/
		createPair(key, value, options = {}) {
			const k = this.createNode(key, null, options);
			const v = this.createNode(value, null, options);
			return new Pair.Pair(k, v);
		}
		/**
		* Removes a value from the document.
		* @returns `true` if the item was found and removed.
		*/
		delete(key) {
			return assertCollection(this.contents) ? this.contents.delete(key) : false;
		}
		/**
		* Removes a value from the document.
		* @returns `true` if the item was found and removed.
		*/
		deleteIn(path) {
			if (Collection.isEmptyPath(path)) {
				if (this.contents == null) return false;
				this.contents = null;
				return true;
			}
			return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
		}
		/**
		* Returns item at `key`, or `undefined` if not found. By default unwraps
		* scalar values from their surrounding node; to disable set `keepScalar` to
		* `true` (collections are always returned intact).
		*/
		get(key, keepScalar) {
			return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
		}
		/**
		* Returns item at `path`, or `undefined` if not found. By default unwraps
		* scalar values from their surrounding node; to disable set `keepScalar` to
		* `true` (collections are always returned intact).
		*/
		getIn(path, keepScalar) {
			if (Collection.isEmptyPath(path)) return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
			return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
		}
		/**
		* Checks if the document includes a value with the key `key`.
		*/
		has(key) {
			return identity.isCollection(this.contents) ? this.contents.has(key) : false;
		}
		/**
		* Checks if the document includes a value at `path`.
		*/
		hasIn(path) {
			if (Collection.isEmptyPath(path)) return this.contents !== void 0;
			return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
		}
		/**
		* Sets a value in this document. For `!!set`, `value` needs to be a
		* boolean to add/remove the item from the set.
		*/
		set(key, value) {
			if (this.contents == null) this.contents = Collection.collectionFromPath(this.schema, [key], value);
			else if (assertCollection(this.contents)) this.contents.set(key, value);
		}
		/**
		* Sets a value in this document. For `!!set`, `value` needs to be a
		* boolean to add/remove the item from the set.
		*/
		setIn(path, value) {
			if (Collection.isEmptyPath(path)) this.contents = value;
			else if (this.contents == null) this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
			else if (assertCollection(this.contents)) this.contents.setIn(path, value);
		}
		/**
		* Change the YAML version and schema used by the document.
		* A `null` version disables support for directives, explicit tags, anchors, and aliases.
		* It also requires the `schema` option to be given as a `Schema` instance value.
		*
		* Overrides all previously set schema options.
		*/
		setSchema(version, options = {}) {
			if (typeof version === "number") version = String(version);
			let opt;
			switch (version) {
				case "1.1":
					if (this.directives) this.directives.yaml.version = "1.1";
					else this.directives = new directives.Directives({ version: "1.1" });
					opt = {
						resolveKnownTags: false,
						schema: "yaml-1.1"
					};
					break;
				case "1.2":
				case "next":
					if (this.directives) this.directives.yaml.version = version;
					else this.directives = new directives.Directives({ version });
					opt = {
						resolveKnownTags: true,
						schema: "core"
					};
					break;
				case null:
					if (this.directives) delete this.directives;
					opt = null;
					break;
				default: {
					const sv = JSON.stringify(version);
					throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
				}
			}
			if (options.schema instanceof Object) this.schema = options.schema;
			else if (opt) this.schema = new Schema.Schema(Object.assign(opt, options));
			else throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
		}
		toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
			const ctx = {
				anchors: /* @__PURE__ */ new Map(),
				doc: this,
				keep: !json,
				mapAsMap: mapAsMap === true,
				mapKeyWarned: false,
				maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
			};
			const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
			if (typeof onAnchor === "function") for (const { count, res } of ctx.anchors.values()) onAnchor(res, count);
			return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
		}
		/**
		* A JSON representation of the document `contents`.
		*
		* @param jsonArg Used by `JSON.stringify` to indicate the array index or
		*   property name.
		*/
		toJSON(jsonArg, onAnchor) {
			return this.toJS({
				json: true,
				jsonArg,
				mapAsMap: false,
				onAnchor
			});
		}
		/** A YAML representation of the document. */
		toString(options = {}) {
			if (this.errors.length > 0) throw new Error("Document with errors cannot be stringified");
			if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
				const s = JSON.stringify(options.indent);
				throw new Error(`"indent" option must be a positive integer, not ${s}`);
			}
			return stringifyDocument.stringifyDocument(this, options);
		}
	};
	function assertCollection(contents) {
		if (identity.isCollection(contents)) return true;
		throw new Error("Expected a YAML collection as document contents");
	}
	exports.Document = Document;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/errors.js
var require_errors = /* @__PURE__ */ __commonJSMin(((exports) => {
	var YAMLError = class extends Error {
		constructor(name, pos, code, message) {
			super();
			this.name = name;
			this.code = code;
			this.message = message;
			this.pos = pos;
		}
	};
	var YAMLParseError = class extends YAMLError {
		constructor(pos, code, message) {
			super("YAMLParseError", pos, code, message);
		}
	};
	var YAMLWarning = class extends YAMLError {
		constructor(pos, code, message) {
			super("YAMLWarning", pos, code, message);
		}
	};
	const prettifyError = (src, lc) => (error) => {
		if (error.pos[0] === -1) return;
		error.linePos = error.pos.map((pos) => lc.linePos(pos));
		const { line, col } = error.linePos[0];
		error.message += ` at line ${line}, column ${col}`;
		let ci = col - 1;
		let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
		if (ci >= 60 && lineStr.length > 80) {
			const trimStart = Math.min(ci - 39, lineStr.length - 79);
			lineStr = "…" + lineStr.substring(trimStart);
			ci -= trimStart - 1;
		}
		if (lineStr.length > 80) lineStr = lineStr.substring(0, 79) + "…";
		if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
			let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
			if (prev.length > 80) prev = prev.substring(0, 79) + "…\n";
			lineStr = prev + lineStr;
		}
		if (/[^ ]/.test(lineStr)) {
			let count = 1;
			const end = error.linePos[1];
			if (end?.line === line && end.col > col) count = Math.max(1, Math.min(end.col - col, 80 - ci));
			const pointer = " ".repeat(ci) + "^".repeat(count);
			error.message += `:\n\n${lineStr}\n${pointer}\n`;
		}
	};
	exports.YAMLError = YAMLError;
	exports.YAMLParseError = YAMLParseError;
	exports.YAMLWarning = YAMLWarning;
	exports.prettifyError = prettifyError;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = /* @__PURE__ */ __commonJSMin(((exports) => {
	function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
		let spaceBefore = false;
		let atNewline = startOnNewline;
		let hasSpace = startOnNewline;
		let comment = "";
		let commentSep = "";
		let hasNewline = false;
		let reqSpace = false;
		let tab = null;
		let anchor = null;
		let tag = null;
		let newlineAfterProp = null;
		let comma = null;
		let found = null;
		let start = null;
		for (const token of tokens) {
			if (reqSpace) {
				if (token.type !== "space" && token.type !== "newline" && token.type !== "comma") onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
				reqSpace = false;
			}
			if (tab) {
				if (atNewline && token.type !== "comment" && token.type !== "newline") onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
				tab = null;
			}
			switch (token.type) {
				case "space":
					if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) tab = token;
					hasSpace = true;
					break;
				case "comment": {
					if (!hasSpace) onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
					const cb = token.source.substring(1) || " ";
					if (!comment) comment = cb;
					else comment += commentSep + cb;
					commentSep = "";
					atNewline = false;
					break;
				}
				case "newline":
					if (atNewline) {
						if (comment) comment += token.source;
						else if (!found || indicator !== "seq-item-ind") spaceBefore = true;
					} else commentSep += token.source;
					atNewline = true;
					hasNewline = true;
					if (anchor || tag) newlineAfterProp = token;
					hasSpace = true;
					break;
				case "anchor":
					if (anchor) onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
					if (token.source.endsWith(":")) onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
					anchor = token;
					start ?? (start = token.offset);
					atNewline = false;
					hasSpace = false;
					reqSpace = true;
					break;
				case "tag":
					if (tag) onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
					tag = token;
					start ?? (start = token.offset);
					atNewline = false;
					hasSpace = false;
					reqSpace = true;
					break;
				case indicator:
					if (anchor || tag) onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
					if (found) onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
					found = token;
					atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
					hasSpace = false;
					break;
				case "comma": if (flow) {
					if (comma) onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
					comma = token;
					atNewline = false;
					hasSpace = false;
					break;
				}
				default:
					onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
					atNewline = false;
					hasSpace = false;
			}
		}
		const last = tokens[tokens.length - 1];
		const end = last ? last.offset + last.source.length : offset;
		if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
		if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq")) onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
		return {
			comma,
			found,
			spaceBefore,
			comment,
			hasNewline,
			anchor,
			tag,
			newlineAfterProp,
			end,
			start: start ?? end
		};
	}
	exports.resolveProps = resolveProps;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = /* @__PURE__ */ __commonJSMin(((exports) => {
	function containsNewline(key) {
		if (!key) return null;
		switch (key.type) {
			case "alias":
			case "scalar":
			case "double-quoted-scalar":
			case "single-quoted-scalar":
				if (key.source.includes("\n")) return true;
				if (key.end) {
					for (const st of key.end) if (st.type === "newline") return true;
				}
				return false;
			case "flow-collection":
				for (const it of key.items) {
					for (const st of it.start) if (st.type === "newline") return true;
					if (it.sep) {
						for (const st of it.sep) if (st.type === "newline") return true;
					}
					if (containsNewline(it.key) || containsNewline(it.value)) return true;
				}
				return false;
			default: return true;
		}
	}
	exports.containsNewline = containsNewline;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = /* @__PURE__ */ __commonJSMin(((exports) => {
	var utilContainsNewline = require_util_contains_newline();
	function flowIndentCheck(indent, fc, onError) {
		if (fc?.type === "flow-collection") {
			const end = fc.end[0];
			if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) onError(end, "BAD_INDENT", "Flow end indicator should be more indented than parent", true);
		}
	}
	exports.flowIndentCheck = flowIndentCheck;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	function mapIncludes(ctx, items, search) {
		const { uniqueKeys } = ctx.options;
		if (uniqueKeys === false) return false;
		const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
		return items.some((pair) => isEqual(pair.key, search));
	}
	exports.mapIncludes = mapIncludes;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Pair = require_Pair();
	var YAMLMap = require_YAMLMap();
	var resolveProps = require_resolve_props();
	var utilContainsNewline = require_util_contains_newline();
	var utilFlowIndentCheck = require_util_flow_indent_check();
	var utilMapIncludes = require_util_map_includes();
	const startColMsg = "All mapping items must start at the same column";
	function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
		const map = new ((tag?.nodeClass) ?? YAMLMap.YAMLMap)(ctx.schema);
		if (ctx.atRoot) ctx.atRoot = false;
		let offset = bm.offset;
		let commentEnd = null;
		for (const collItem of bm.items) {
			const { start, key, sep, value } = collItem;
			const keyProps = resolveProps.resolveProps(start, {
				indicator: "explicit-key-ind",
				next: key ?? sep?.[0],
				offset,
				onError,
				parentIndent: bm.indent,
				startOnNewline: true
			});
			const implicitKey = !keyProps.found;
			if (implicitKey) {
				if (key) {
					if (key.type === "block-seq") onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
					else if ("indent" in key && key.indent !== bm.indent) onError(offset, "BAD_INDENT", startColMsg);
				}
				if (!keyProps.anchor && !keyProps.tag && !sep) {
					commentEnd = keyProps.end;
					if (keyProps.comment) {
						if (map.comment) map.comment += "\n" + keyProps.comment;
						else map.comment = keyProps.comment;
					}
					continue;
				}
				if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
			} else if (keyProps.found?.indent !== bm.indent) onError(offset, "BAD_INDENT", startColMsg);
			ctx.atKey = true;
			const keyStart = keyProps.end;
			const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
			if (ctx.schema.compat) utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
			ctx.atKey = false;
			if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode)) onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
			const valueProps = resolveProps.resolveProps(sep ?? [], {
				indicator: "map-value-ind",
				next: value,
				offset: keyNode.range[2],
				onError,
				parentIndent: bm.indent,
				startOnNewline: !key || key.type === "block-scalar"
			});
			offset = valueProps.end;
			if (valueProps.found) {
				if (implicitKey) {
					if (value?.type === "block-map" && !valueProps.hasNewline) onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
					if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024) onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
				}
				const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
				if (ctx.schema.compat) utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
				offset = valueNode.range[2];
				const pair = new Pair.Pair(keyNode, valueNode);
				if (ctx.options.keepSourceTokens) pair.srcToken = collItem;
				map.items.push(pair);
			} else {
				if (implicitKey) onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
				if (valueProps.comment) {
					if (keyNode.comment) keyNode.comment += "\n" + valueProps.comment;
					else keyNode.comment = valueProps.comment;
				}
				const pair = new Pair.Pair(keyNode);
				if (ctx.options.keepSourceTokens) pair.srcToken = collItem;
				map.items.push(pair);
			}
		}
		if (commentEnd && commentEnd < offset) onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
		map.range = [
			bm.offset,
			offset,
			commentEnd ?? offset
		];
		return map;
	}
	exports.resolveBlockMap = resolveBlockMap;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = /* @__PURE__ */ __commonJSMin(((exports) => {
	var YAMLSeq = require_YAMLSeq();
	var resolveProps = require_resolve_props();
	var utilFlowIndentCheck = require_util_flow_indent_check();
	function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
		const seq = new ((tag?.nodeClass) ?? YAMLSeq.YAMLSeq)(ctx.schema);
		if (ctx.atRoot) ctx.atRoot = false;
		if (ctx.atKey) ctx.atKey = false;
		let offset = bs.offset;
		let commentEnd = null;
		for (const { start, value } of bs.items) {
			const props = resolveProps.resolveProps(start, {
				indicator: "seq-item-ind",
				next: value,
				offset,
				onError,
				parentIndent: bs.indent,
				startOnNewline: true
			});
			if (!props.found) {
				if (props.anchor || props.tag || value) {
					if (value?.type === "block-seq") onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
					else onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
				} else {
					commentEnd = props.end;
					if (props.comment) seq.comment = props.comment;
					continue;
				}
			}
			const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
			if (ctx.schema.compat) utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
			offset = node.range[2];
			seq.items.push(node);
		}
		seq.range = [
			bs.offset,
			offset,
			commentEnd ?? offset
		];
		return seq;
	}
	exports.resolveBlockSeq = resolveBlockSeq;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = /* @__PURE__ */ __commonJSMin(((exports) => {
	function resolveEnd(end, offset, reqSpace, onError) {
		let comment = "";
		if (end) {
			let hasSpace = false;
			let sep = "";
			for (const token of end) {
				const { source, type } = token;
				switch (type) {
					case "space":
						hasSpace = true;
						break;
					case "comment": {
						if (reqSpace && !hasSpace) onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
						const cb = source.substring(1) || " ";
						if (!comment) comment = cb;
						else comment += sep + cb;
						sep = "";
						break;
					}
					case "newline":
						if (comment) sep += source;
						hasSpace = true;
						break;
					default: onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
				}
				offset += source.length;
			}
		}
		return {
			comment,
			offset
		};
	}
	exports.resolveEnd = resolveEnd;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Pair = require_Pair();
	var YAMLMap = require_YAMLMap();
	var YAMLSeq = require_YAMLSeq();
	var resolveEnd = require_resolve_end();
	var resolveProps = require_resolve_props();
	var utilContainsNewline = require_util_contains_newline();
	var utilMapIncludes = require_util_map_includes();
	const blockMsg = "Block collections are not allowed within flow collections";
	const isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
	function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
		const isMap = fc.start.source === "{";
		const fcName = isMap ? "flow map" : "flow sequence";
		const coll = new ((tag?.nodeClass) ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq))(ctx.schema);
		coll.flow = true;
		const atRoot = ctx.atRoot;
		if (atRoot) ctx.atRoot = false;
		if (ctx.atKey) ctx.atKey = false;
		let offset = fc.offset + fc.start.source.length;
		for (let i = 0; i < fc.items.length; ++i) {
			const collItem = fc.items[i];
			const { start, key, sep, value } = collItem;
			const props = resolveProps.resolveProps(start, {
				flow: fcName,
				indicator: "explicit-key-ind",
				next: key ?? sep?.[0],
				offset,
				onError,
				parentIndent: fc.indent,
				startOnNewline: false
			});
			if (!props.found) {
				if (!props.anchor && !props.tag && !sep && !value) {
					if (i === 0 && props.comma) onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
					else if (i < fc.items.length - 1) onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
					if (props.comment) {
						if (coll.comment) coll.comment += "\n" + props.comment;
						else coll.comment = props.comment;
					}
					offset = props.end;
					continue;
				}
				if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key)) onError(key, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
			}
			if (i === 0) {
				if (props.comma) onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
			} else {
				if (!props.comma) onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
				if (props.comment) {
					let prevItemComment = "";
					loop: for (const st of start) switch (st.type) {
						case "comma":
						case "space": break;
						case "comment":
							prevItemComment = st.source.substring(1);
							break loop;
						default: break loop;
					}
					if (prevItemComment) {
						let prev = coll.items[coll.items.length - 1];
						if (identity.isPair(prev)) prev = prev.value ?? prev.key;
						if (prev.comment) prev.comment += "\n" + prevItemComment;
						else prev.comment = prevItemComment;
						props.comment = props.comment.substring(prevItemComment.length + 1);
					}
				}
			}
			if (!isMap && !sep && !props.found) {
				const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
				coll.items.push(valueNode);
				offset = valueNode.range[2];
				if (isBlock(value)) onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
			} else {
				ctx.atKey = true;
				const keyStart = props.end;
				const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
				if (isBlock(key)) onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
				ctx.atKey = false;
				const valueProps = resolveProps.resolveProps(sep ?? [], {
					flow: fcName,
					indicator: "map-value-ind",
					next: value,
					offset: keyNode.range[2],
					onError,
					parentIndent: fc.indent,
					startOnNewline: false
				});
				if (valueProps.found) {
					if (!isMap && !props.found && ctx.options.strict) {
						if (sep) for (const st of sep) {
							if (st === valueProps.found) break;
							if (st.type === "newline") {
								onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
								break;
							}
						}
						if (props.start < valueProps.found.offset - 1024) onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
					}
				} else if (value) {
					if ("source" in value && value.source?.[0] === ":") onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
					else onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
				}
				const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
				if (valueNode) {
					if (isBlock(value)) onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
				} else if (valueProps.comment) {
					if (keyNode.comment) keyNode.comment += "\n" + valueProps.comment;
					else keyNode.comment = valueProps.comment;
				}
				const pair = new Pair.Pair(keyNode, valueNode);
				if (ctx.options.keepSourceTokens) pair.srcToken = collItem;
				if (isMap) {
					const map = coll;
					if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode)) onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
					map.items.push(pair);
				} else {
					const map = new YAMLMap.YAMLMap(ctx.schema);
					map.flow = true;
					map.items.push(pair);
					const endRange = (valueNode ?? keyNode).range;
					map.range = [
						keyNode.range[0],
						endRange[1],
						endRange[2]
					];
					coll.items.push(map);
				}
				offset = valueNode ? valueNode.range[2] : valueProps.end;
			}
		}
		const expectedEnd = isMap ? "}" : "]";
		const [ce, ...ee] = fc.end;
		let cePos = offset;
		if (ce?.source === expectedEnd) cePos = ce.offset + ce.source.length;
		else {
			const name = fcName[0].toUpperCase() + fcName.substring(1);
			const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
			onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
			if (ce && ce.source.length !== 1) ee.unshift(ce);
		}
		if (ee.length > 0) {
			const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
			if (end.comment) {
				if (coll.comment) coll.comment += "\n" + end.comment;
				else coll.comment = end.comment;
			}
			coll.range = [
				fc.offset,
				cePos,
				end.offset
			];
		} else coll.range = [
			fc.offset,
			cePos,
			cePos
		];
		return coll;
	}
	exports.resolveFlowCollection = resolveFlowCollection;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Scalar = require_Scalar();
	var YAMLMap = require_YAMLMap();
	var YAMLSeq = require_YAMLSeq();
	var resolveBlockMap = require_resolve_block_map();
	var resolveBlockSeq = require_resolve_block_seq();
	var resolveFlowCollection = require_resolve_flow_collection();
	function resolveCollection(CN, ctx, token, onError, tagName, tag) {
		const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
		const Coll = coll.constructor;
		if (tagName === "!" || tagName === Coll.tagName) {
			coll.tag = Coll.tagName;
			return coll;
		}
		if (tagName) coll.tag = tagName;
		return coll;
	}
	function composeCollection(CN, ctx, token, props, onError) {
		const tagToken = props.tag;
		const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
		if (token.type === "block-seq") {
			const { anchor, newlineAfterProp: nl } = props;
			const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
			if (lastProp && (!nl || nl.offset < lastProp.offset)) onError(lastProp, "MISSING_CHAR", "Missing newline after block sequence props");
		}
		const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
		if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") return resolveCollection(CN, ctx, token, onError, tagName);
		let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
		if (!tag) {
			const kt = ctx.schema.knownTags[tagName];
			if (kt?.collection === expType) {
				ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
				tag = kt;
			} else {
				if (kt) onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
				else onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
				return resolveCollection(CN, ctx, token, onError, tagName);
			}
		}
		const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
		const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
		const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
		node.range = coll.range;
		node.tag = tagName;
		if (tag?.format) node.format = tag.format;
		return node;
	}
	exports.composeCollection = composeCollection;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	function resolveBlockScalar(ctx, scalar, onError) {
		const start = scalar.offset;
		const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
		if (!header) return {
			value: "",
			type: null,
			comment: "",
			range: [
				start,
				start,
				start
			]
		};
		const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
		const lines = scalar.source ? splitLines(scalar.source) : [];
		let chompStart = lines.length;
		for (let i = lines.length - 1; i >= 0; --i) {
			const content = lines[i][1];
			if (content === "" || content === "\r") chompStart = i;
			else break;
		}
		if (chompStart === 0) {
			const value = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
			let end = start + header.length;
			if (scalar.source) end += scalar.source.length;
			return {
				value,
				type,
				comment: header.comment,
				range: [
					start,
					end,
					end
				]
			};
		}
		let trimIndent = scalar.indent + header.indent;
		let offset = scalar.offset + header.length;
		let contentStart = 0;
		for (let i = 0; i < chompStart; ++i) {
			const [indent, content] = lines[i];
			if (content === "" || content === "\r") {
				if (header.indent === 0 && indent.length > trimIndent) trimIndent = indent.length;
			} else {
				if (indent.length < trimIndent) onError(offset + indent.length, "MISSING_CHAR", "Block scalars with more-indented leading empty lines must use an explicit indentation indicator");
				if (header.indent === 0) trimIndent = indent.length;
				contentStart = i;
				if (trimIndent === 0 && !ctx.atRoot) onError(offset, "BAD_INDENT", "Block scalar values in collections must be indented");
				break;
			}
			offset += indent.length + content.length + 1;
		}
		for (let i = lines.length - 1; i >= chompStart; --i) if (lines[i][0].length > trimIndent) chompStart = i + 1;
		let value = "";
		let sep = "";
		let prevMoreIndented = false;
		for (let i = 0; i < contentStart; ++i) value += lines[i][0].slice(trimIndent) + "\n";
		for (let i = contentStart; i < chompStart; ++i) {
			let [indent, content] = lines[i];
			offset += indent.length + content.length + 1;
			const crlf = content[content.length - 1] === "\r";
			if (crlf) content = content.slice(0, -1);
			/* istanbul ignore if already caught in lexer */
			if (content && indent.length < trimIndent) {
				const message = `Block scalar lines must not be less indented than their ${header.indent ? "explicit indentation indicator" : "first line"}`;
				onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
				indent = "";
			}
			if (type === Scalar.Scalar.BLOCK_LITERAL) {
				value += sep + indent.slice(trimIndent) + content;
				sep = "\n";
			} else if (indent.length > trimIndent || content[0] === "	") {
				if (sep === " ") sep = "\n";
				else if (!prevMoreIndented && sep === "\n") sep = "\n\n";
				value += sep + indent.slice(trimIndent) + content;
				sep = "\n";
				prevMoreIndented = true;
			} else if (content === "") {
				if (sep === "\n") value += "\n";
				else sep = "\n";
			} else {
				value += sep + content;
				sep = " ";
				prevMoreIndented = false;
			}
		}
		switch (header.chomp) {
			case "-": break;
			case "+":
				for (let i = chompStart; i < lines.length; ++i) value += "\n" + lines[i][0].slice(trimIndent);
				if (value[value.length - 1] !== "\n") value += "\n";
				break;
			default: value += "\n";
		}
		const end = start + header.length + scalar.source.length;
		return {
			value,
			type,
			comment: header.comment,
			range: [
				start,
				end,
				end
			]
		};
	}
	function parseBlockScalarHeader({ offset, props }, strict, onError) {
		/* istanbul ignore if should not happen */
		if (props[0].type !== "block-scalar-header") {
			onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
			return null;
		}
		const { source } = props[0];
		const mode = source[0];
		let indent = 0;
		let chomp = "";
		let error = -1;
		for (let i = 1; i < source.length; ++i) {
			const ch = source[i];
			if (!chomp && (ch === "-" || ch === "+")) chomp = ch;
			else {
				const n = Number(ch);
				if (!indent && n) indent = n;
				else if (error === -1) error = offset + i;
			}
		}
		if (error !== -1) onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
		let hasSpace = false;
		let comment = "";
		let length = source.length;
		for (let i = 1; i < props.length; ++i) {
			const token = props[i];
			switch (token.type) {
				case "space": hasSpace = true;
				case "newline":
					length += token.source.length;
					break;
				case "comment":
					if (strict && !hasSpace) onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
					length += token.source.length;
					comment = token.source.substring(1);
					break;
				case "error":
					onError(token, "UNEXPECTED_TOKEN", token.message);
					length += token.source.length;
					break;
				/* istanbul ignore next should not happen */
				default: {
					onError(token, "UNEXPECTED_TOKEN", `Unexpected token in block scalar header: ${token.type}`);
					const ts = token.source;
					if (ts && typeof ts === "string") length += ts.length;
				}
			}
		}
		return {
			mode,
			indent,
			chomp,
			comment,
			length
		};
	}
	/** @returns Array of lines split up as `[indent, content]` */
	function splitLines(source) {
		const split = source.split(/\n( *)/);
		const first = split[0];
		const m = first.match(/^( *)/);
		const lines = [m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first]];
		for (let i = 1; i < split.length; i += 2) lines.push([split[i], split[i + 1]]);
		return lines;
	}
	exports.resolveBlockScalar = resolveBlockScalar;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	var resolveEnd = require_resolve_end();
	function resolveFlowScalar(scalar, strict, onError) {
		const { offset, type, source, end } = scalar;
		let _type;
		let value;
		const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
		switch (type) {
			case "scalar":
				_type = Scalar.Scalar.PLAIN;
				value = plainValue(source, _onError);
				break;
			case "single-quoted-scalar":
				_type = Scalar.Scalar.QUOTE_SINGLE;
				value = singleQuotedValue(source, _onError);
				break;
			case "double-quoted-scalar":
				_type = Scalar.Scalar.QUOTE_DOUBLE;
				value = doubleQuotedValue(source, _onError);
				break;
			/* istanbul ignore next should not happen */
			default:
				onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
				return {
					value: "",
					type: null,
					comment: "",
					range: [
						offset,
						offset + source.length,
						offset + source.length
					]
				};
		}
		const valueEnd = offset + source.length;
		const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
		return {
			value,
			type: _type,
			comment: re.comment,
			range: [
				offset,
				valueEnd,
				re.offset
			]
		};
	}
	function plainValue(source, onError) {
		let badChar = "";
		switch (source[0]) {
			/* istanbul ignore next should not happen */
			case "	":
				badChar = "a tab character";
				break;
			case ",":
				badChar = "flow indicator character ,";
				break;
			case "%":
				badChar = "directive indicator character %";
				break;
			case "|":
			case ">":
				badChar = `block scalar indicator ${source[0]}`;
				break;
			case "@":
			case "`": badChar = `reserved character ${source[0]}`;
		}
		if (badChar) onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
		return foldLines(source);
	}
	function singleQuotedValue(source, onError) {
		if (source[source.length - 1] !== "'" || source.length === 1) onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
		return foldLines(source.slice(1, -1)).replace(/''/g, "'");
	}
	function foldLines(source) {
		/**
		* The negative lookbehind here and in the `re` RegExp is to
		* prevent causing a polynomial search time in certain cases.
		*
		* The try-catch is for Safari, which doesn't support this yet:
		* https://caniuse.com/js-regexp-lookbehind
		*/
		let first, line;
		try {
			first = /* @__PURE__ */ new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
			line = /* @__PURE__ */ new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
		} catch {
			first = /(.*?)[ \t]*\r?\n/sy;
			line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
		}
		let match = first.exec(source);
		if (!match) return source;
		let res = match[1];
		let sep = " ";
		let pos = first.lastIndex;
		line.lastIndex = pos;
		while (match = line.exec(source)) {
			if (match[1] === "") {
				if (sep === "\n") res += sep;
				else sep = "\n";
			} else {
				res += sep + match[1];
				sep = " ";
			}
			pos = line.lastIndex;
		}
		const last = /[ \t]*(.*)/sy;
		last.lastIndex = pos;
		match = last.exec(source);
		return res + sep + (match?.[1] ?? "");
	}
	function doubleQuotedValue(source, onError) {
		let res = "";
		for (let i = 1; i < source.length - 1; ++i) {
			const ch = source[i];
			if (ch === "\r" && source[i + 1] === "\n") continue;
			if (ch === "\n") {
				const { fold, offset } = foldNewline(source, i);
				res += fold;
				i = offset;
			} else if (ch === "\\") {
				let next = source[++i];
				const cc = escapeCodes[next];
				if (cc) res += cc;
				else if (next === "\n") {
					next = source[i + 1];
					while (next === " " || next === "	") next = source[++i + 1];
				} else if (next === "\r" && source[i + 1] === "\n") {
					next = source[++i + 1];
					while (next === " " || next === "	") next = source[++i + 1];
				} else if (next === "x" || next === "u" || next === "U") {
					const length = next === "x" ? 2 : next === "u" ? 4 : 8;
					res += parseCharCode(source, i + 1, length, onError);
					i += length;
				} else {
					const raw = source.substr(i - 1, 2);
					onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
					res += raw;
				}
			} else if (ch === " " || ch === "	") {
				const wsStart = i;
				let next = source[i + 1];
				while (next === " " || next === "	") next = source[++i + 1];
				if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n")) res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
			} else res += ch;
		}
		if (source[source.length - 1] !== "\"" || source.length === 1) onError(source.length, "MISSING_CHAR", "Missing closing \"quote");
		return res;
	}
	/**
	* Fold a single newline into a space, multiple newlines to N - 1 newlines.
	* Presumes `source[offset] === '\n'`
	*/
	function foldNewline(source, offset) {
		let fold = "";
		let ch = source[offset + 1];
		while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
			if (ch === "\r" && source[offset + 2] !== "\n") break;
			if (ch === "\n") fold += "\n";
			offset += 1;
			ch = source[offset + 1];
		}
		if (!fold) fold = " ";
		return {
			fold,
			offset
		};
	}
	const escapeCodes = {
		"0": "\0",
		a: "\x07",
		b: "\b",
		e: "\x1B",
		f: "\f",
		n: "\n",
		r: "\r",
		t: "	",
		v: "\v",
		N: "",
		_: "\xA0",
		L: "\u2028",
		P: "\u2029",
		" ": " ",
		"\"": "\"",
		"/": "/",
		"\\": "\\",
		"	": "	"
	};
	function parseCharCode(source, offset, length, onError) {
		const cc = source.substr(offset, length);
		const code = cc.length === length && /^[0-9a-fA-F]+$/.test(cc) ? parseInt(cc, 16) : NaN;
		try {
			return String.fromCodePoint(code);
		} catch {
			const raw = source.substr(offset - 2, length + 2);
			onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
			return raw;
		}
	}
	exports.resolveFlowScalar = resolveFlowScalar;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Scalar = require_Scalar();
	var resolveBlockScalar = require_resolve_block_scalar();
	var resolveFlowScalar = require_resolve_flow_scalar();
	function composeScalar(ctx, token, tagToken, onError) {
		const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
		const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
		let tag;
		if (ctx.options.stringKeys && ctx.atKey) tag = ctx.schema[identity.SCALAR];
		else if (tagName) tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
		else if (token.type === "scalar") tag = findScalarTagByTest(ctx, value, token, onError);
		else tag = ctx.schema[identity.SCALAR];
		let scalar;
		try {
			const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
			scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
			scalar = new Scalar.Scalar(value);
		}
		scalar.range = range;
		scalar.source = value;
		if (type) scalar.type = type;
		if (tagName) scalar.tag = tagName;
		if (tag.format) scalar.format = tag.format;
		if (comment) scalar.comment = comment;
		return scalar;
	}
	function findScalarTagByName(schema, value, tagName, tagToken, onError) {
		if (tagName === "!") return schema[identity.SCALAR];
		const matchWithTest = [];
		for (const tag of schema.tags) if (!tag.collection && tag.tag === tagName) {
			if (tag.default && tag.test) matchWithTest.push(tag);
			else return tag;
		}
		for (const tag of matchWithTest) if (tag.test?.test(value)) return tag;
		const kt = schema.knownTags[tagName];
		if (kt && !kt.collection) {
			schema.tags.push(Object.assign({}, kt, {
				default: false,
				test: void 0
			}));
			return kt;
		}
		onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
		return schema[identity.SCALAR];
	}
	function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
		const tag = schema.tags.find((tag) => (tag.default === true || atKey && tag.default === "key") && tag.test?.test(value)) || schema[identity.SCALAR];
		if (schema.compat) {
			const compat = schema.compat.find((tag) => tag.default && tag.test?.test(value)) ?? schema[identity.SCALAR];
			if (tag.tag !== compat.tag) onError(token, "TAG_RESOLVE_FAILED", `Value may be parsed as either ${directives.tagString(tag.tag)} or ${directives.tagString(compat.tag)}`, true);
		}
		return tag;
	}
	exports.composeScalar = composeScalar;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = /* @__PURE__ */ __commonJSMin(((exports) => {
	function emptyScalarPosition(offset, before, pos) {
		if (before) {
			pos ?? (pos = before.length);
			for (let i = pos - 1; i >= 0; --i) {
				let st = before[i];
				switch (st.type) {
					case "space":
					case "comment":
					case "newline":
						offset -= st.source.length;
						continue;
				}
				st = before[++i];
				while (st?.type === "space") {
					offset += st.source.length;
					st = before[++i];
				}
				break;
			}
		}
		return offset;
	}
	exports.emptyScalarPosition = emptyScalarPosition;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Alias = require_Alias();
	var identity = require_identity();
	var composeCollection = require_compose_collection();
	var composeScalar = require_compose_scalar();
	var resolveEnd = require_resolve_end();
	var utilEmptyScalarPosition = require_util_empty_scalar_position();
	const CN = {
		composeNode,
		composeEmptyNode
	};
	function composeNode(ctx, token, props, onError) {
		const atKey = ctx.atKey;
		const { spaceBefore, comment, anchor, tag } = props;
		let node;
		let isSrcToken = true;
		switch (token.type) {
			case "alias":
				node = composeAlias(ctx, token, onError);
				if (anchor || tag) onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
				break;
			case "scalar":
			case "single-quoted-scalar":
			case "double-quoted-scalar":
			case "block-scalar":
				node = composeScalar.composeScalar(ctx, token, tag, onError);
				if (anchor) node.anchor = anchor.source.substring(1);
				break;
			case "block-map":
			case "block-seq":
			case "flow-collection":
				try {
					node = composeCollection.composeCollection(CN, ctx, token, props, onError);
					if (anchor) node.anchor = anchor.source.substring(1);
				} catch (error) {
					onError(token, "RESOURCE_EXHAUSTION", error instanceof Error ? error.message : String(error));
				}
				break;
			default:
				onError(token, "UNEXPECTED_TOKEN", token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`);
				isSrcToken = false;
		}
		node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
		if (anchor && node.anchor === "") onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
		if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) onError(tag ?? token, "NON_STRING_KEY", "With stringKeys, all keys must be strings");
		if (spaceBefore) node.spaceBefore = true;
		if (comment) {
			if (token.type === "scalar" && token.source === "") node.comment = comment;
			else node.commentBefore = comment;
		}
		if (ctx.options.keepSourceTokens && isSrcToken) node.srcToken = token;
		return node;
	}
	function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
		const token = {
			type: "scalar",
			offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
			indent: -1,
			source: ""
		};
		const node = composeScalar.composeScalar(ctx, token, tag, onError);
		if (anchor) {
			node.anchor = anchor.source.substring(1);
			if (node.anchor === "") onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
		}
		if (spaceBefore) node.spaceBefore = true;
		if (comment) {
			node.comment = comment;
			node.range[2] = end;
		}
		return node;
	}
	function composeAlias({ options }, { offset, source, end }, onError) {
		const alias = new Alias.Alias(source.substring(1));
		if (alias.source === "") onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
		if (alias.source.endsWith(":")) onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
		const valueEnd = offset + source.length;
		const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
		alias.range = [
			offset,
			valueEnd,
			re.offset
		];
		if (re.comment) alias.comment = re.comment;
		return alias;
	}
	exports.composeEmptyNode = composeEmptyNode;
	exports.composeNode = composeNode;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Document = require_Document();
	var composeNode = require_compose_node();
	var resolveEnd = require_resolve_end();
	var resolveProps = require_resolve_props();
	function composeDoc(options, directives, { offset, start, value, end }, onError) {
		const opts = Object.assign({ _directives: directives }, options);
		const doc = new Document.Document(void 0, opts);
		const ctx = {
			atKey: false,
			atRoot: true,
			directives: doc.directives,
			options: doc.options,
			schema: doc.schema
		};
		const props = resolveProps.resolveProps(start, {
			indicator: "doc-start",
			next: value ?? end?.[0],
			offset,
			onError,
			parentIndent: 0,
			startOnNewline: true
		});
		if (props.found) {
			doc.directives.docStart = true;
			if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline) onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
		}
		doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
		const contentEnd = doc.contents.range[2];
		const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
		if (re.comment) doc.comment = re.comment;
		doc.range = [
			offset,
			contentEnd,
			re.offset
		];
		return doc;
	}
	exports.composeDoc = composeDoc;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/compose/composer.js
var require_composer = /* @__PURE__ */ __commonJSMin(((exports) => {
	var node_process$1 = __require("process");
	var directives = require_directives();
	var Document = require_Document();
	var errors = require_errors();
	var identity = require_identity();
	var composeDoc = require_compose_doc();
	var resolveEnd = require_resolve_end();
	function getErrorPos(src) {
		if (typeof src === "number") return [src, src + 1];
		if (Array.isArray(src)) return src.length === 2 ? src : [src[0], src[1]];
		const { offset, source } = src;
		return [offset, offset + (typeof source === "string" ? source.length : 1)];
	}
	function parsePrelude(prelude) {
		let comment = "";
		let atComment = false;
		let afterEmptyLine = false;
		for (let i = 0; i < prelude.length; ++i) {
			const source = prelude[i];
			switch (source[0]) {
				case "#":
					comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
					atComment = true;
					afterEmptyLine = false;
					break;
				case "%":
					if (prelude[i + 1]?.[0] !== "#") i += 1;
					atComment = false;
					break;
				default:
					if (!atComment) afterEmptyLine = true;
					atComment = false;
			}
		}
		return {
			comment,
			afterEmptyLine
		};
	}
	/**
	* Compose a stream of CST nodes into a stream of YAML Documents.
	*
	* ```ts
	* import { Composer, Parser } from 'yaml'
	*
	* const src: string = ...
	* const tokens = new Parser().parse(src)
	* const docs = new Composer().compose(tokens)
	* ```
	*/
	var Composer = class {
		constructor(options = {}) {
			this.doc = null;
			this.atDirectives = false;
			this.prelude = [];
			this.errors = [];
			this.warnings = [];
			this.onError = (source, code, message, warning) => {
				const pos = getErrorPos(source);
				if (warning) this.warnings.push(new errors.YAMLWarning(pos, code, message));
				else this.errors.push(new errors.YAMLParseError(pos, code, message));
			};
			this.directives = new directives.Directives({ version: options.version || "1.2" });
			this.options = options;
		}
		decorate(doc, afterDoc) {
			const { comment, afterEmptyLine } = parsePrelude(this.prelude);
			if (comment) {
				const dc = doc.contents;
				if (afterDoc) doc.comment = doc.comment ? `${doc.comment}\n${comment}` : comment;
				else if (afterEmptyLine || doc.directives.docStart || !dc) doc.commentBefore = comment;
				else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
					let it = dc.items[0];
					if (identity.isPair(it)) it = it.key;
					const cb = it.commentBefore;
					it.commentBefore = cb ? `${comment}\n${cb}` : comment;
				} else {
					const cb = dc.commentBefore;
					dc.commentBefore = cb ? `${comment}\n${cb}` : comment;
				}
			}
			if (afterDoc) {
				for (let i = 0; i < this.errors.length; ++i) doc.errors.push(this.errors[i]);
				for (let i = 0; i < this.warnings.length; ++i) doc.warnings.push(this.warnings[i]);
			} else {
				doc.errors = this.errors;
				doc.warnings = this.warnings;
			}
			this.prelude = [];
			this.errors = [];
			this.warnings = [];
		}
		/**
		* Current stream status information.
		*
		* Mostly useful at the end of input for an empty stream.
		*/
		streamInfo() {
			return {
				comment: parsePrelude(this.prelude).comment,
				directives: this.directives,
				errors: this.errors,
				warnings: this.warnings
			};
		}
		/**
		* Compose tokens into documents.
		*
		* @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
		* @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
		*/
		*compose(tokens, forceDoc = false, endOffset = -1) {
			for (const token of tokens) yield* this.next(token);
			yield* this.end(forceDoc, endOffset);
		}
		/** Advance the composer by one CST token. */
		*next(token) {
			if (node_process$1.env.LOG_STREAM) console.dir(token, { depth: null });
			switch (token.type) {
				case "directive":
					this.directives.add(token.source, (offset, message, warning) => {
						const pos = getErrorPos(token);
						pos[0] += offset;
						this.onError(pos, "BAD_DIRECTIVE", message, warning);
					});
					this.prelude.push(token.source);
					this.atDirectives = true;
					break;
				case "document": {
					const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
					if (this.atDirectives && !doc.directives.docStart) this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
					this.decorate(doc, false);
					if (this.doc) yield this.doc;
					this.doc = doc;
					this.atDirectives = false;
					break;
				}
				case "byte-order-mark":
				case "space": break;
				case "comment":
				case "newline":
					this.prelude.push(token.source);
					break;
				case "error": {
					const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
					const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
					if (this.atDirectives || !this.doc) this.errors.push(error);
					else this.doc.errors.push(error);
					break;
				}
				case "doc-end": {
					if (!this.doc) {
						this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", "Unexpected doc-end without preceding document"));
						break;
					}
					this.doc.directives.docEnd = true;
					const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
					this.decorate(this.doc, true);
					if (end.comment) {
						const dc = this.doc.comment;
						this.doc.comment = dc ? `${dc}\n${end.comment}` : end.comment;
					}
					this.doc.range[2] = end.offset;
					break;
				}
				default: this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
			}
		}
		/**
		* Call at end of input to yield any remaining document.
		*
		* @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
		* @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
		*/
		*end(forceDoc = false, endOffset = -1) {
			if (this.doc) {
				this.decorate(this.doc, true);
				yield this.doc;
				this.doc = null;
			} else if (forceDoc) {
				const opts = Object.assign({ _directives: this.directives }, this.options);
				const doc = new Document.Document(void 0, opts);
				if (this.atDirectives) this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
				doc.range = [
					0,
					endOffset,
					endOffset
				];
				this.decorate(doc, false);
				yield doc;
			}
		}
	};
	exports.Composer = Composer;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = /* @__PURE__ */ __commonJSMin(((exports) => {
	var resolveBlockScalar = require_resolve_block_scalar();
	var resolveFlowScalar = require_resolve_flow_scalar();
	var errors = require_errors();
	var stringifyString = require_stringifyString();
	function resolveAsScalar(token, strict = true, onError) {
		if (token) {
			const _onError = (pos, code, message) => {
				const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
				if (onError) onError(offset, code, message);
				else throw new errors.YAMLParseError([offset, offset + 1], code, message);
			};
			switch (token.type) {
				case "scalar":
				case "single-quoted-scalar":
				case "double-quoted-scalar": return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
				case "block-scalar": return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
			}
		}
		return null;
	}
	/**
	* Create a new scalar token with `value`
	*
	* Values that represent an actual string but may be parsed as a different type should use a `type` other than `'PLAIN'`,
	* as this function does not support any schema operations and won't check for such conflicts.
	*
	* @param value The string representation of the value, which will have its content properly indented.
	* @param context.end Comments and whitespace after the end of the value, or after the block scalar header. If undefined, a newline will be added.
	* @param context.implicitKey Being within an implicit key may affect the resolved type of the token's value.
	* @param context.indent The indent level of the token.
	* @param context.inFlow Is this scalar within a flow collection? This may affect the resolved type of the token's value.
	* @param context.offset The offset position of the token.
	* @param context.type The preferred type of the scalar token. If undefined, the previous type of the `token` will be used, defaulting to `'PLAIN'`.
	*/
	function createScalarToken(value, context) {
		const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
		const source = stringifyString.stringifyString({
			type,
			value
		}, {
			implicitKey,
			indent: indent > 0 ? " ".repeat(indent) : "",
			inFlow,
			options: {
				blockQuote: true,
				lineWidth: -1
			}
		});
		const end = context.end ?? [{
			type: "newline",
			offset: -1,
			indent,
			source: "\n"
		}];
		switch (source[0]) {
			case "|":
			case ">": {
				const he = source.indexOf("\n");
				const head = source.substring(0, he);
				const body = source.substring(he + 1) + "\n";
				const props = [{
					type: "block-scalar-header",
					offset,
					indent,
					source: head
				}];
				if (!addEndtoBlockProps(props, end)) props.push({
					type: "newline",
					offset: -1,
					indent,
					source: "\n"
				});
				return {
					type: "block-scalar",
					offset,
					indent,
					props,
					source: body
				};
			}
			case "\"": return {
				type: "double-quoted-scalar",
				offset,
				indent,
				source,
				end
			};
			case "'": return {
				type: "single-quoted-scalar",
				offset,
				indent,
				source,
				end
			};
			default: return {
				type: "scalar",
				offset,
				indent,
				source,
				end
			};
		}
	}
	/**
	* Set the value of `token` to the given string `value`, overwriting any previous contents and type that it may have.
	*
	* Best efforts are made to retain any comments previously associated with the `token`,
	* though all contents within a collection's `items` will be overwritten.
	*
	* Values that represent an actual string but may be parsed as a different type should use a `type` other than `'PLAIN'`,
	* as this function does not support any schema operations and won't check for such conflicts.
	*
	* @param token Any token. If it does not include an `indent` value, the value will be stringified as if it were an implicit key.
	* @param value The string representation of the value, which will have its content properly indented.
	* @param context.afterKey In most cases, values after a key should have an additional level of indentation.
	* @param context.implicitKey Being within an implicit key may affect the resolved type of the token's value.
	* @param context.inFlow Being within a flow collection may affect the resolved type of the token's value.
	* @param context.type The preferred type of the scalar token. If undefined, the previous type of the `token` will be used, defaulting to `'PLAIN'`.
	*/
	function setScalarValue(token, value, context = {}) {
		let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
		let indent = "indent" in token ? token.indent : null;
		if (afterKey && typeof indent === "number") indent += 2;
		if (!type) switch (token.type) {
			case "single-quoted-scalar":
				type = "QUOTE_SINGLE";
				break;
			case "double-quoted-scalar":
				type = "QUOTE_DOUBLE";
				break;
			case "block-scalar": {
				const header = token.props[0];
				if (header.type !== "block-scalar-header") throw new Error("Invalid block scalar header");
				type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
				break;
			}
			default: type = "PLAIN";
		}
		const source = stringifyString.stringifyString({
			type,
			value
		}, {
			implicitKey: implicitKey || indent === null,
			indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
			inFlow,
			options: {
				blockQuote: true,
				lineWidth: -1
			}
		});
		switch (source[0]) {
			case "|":
			case ">":
				setBlockScalarValue(token, source);
				break;
			case "\"":
				setFlowScalarValue(token, source, "double-quoted-scalar");
				break;
			case "'":
				setFlowScalarValue(token, source, "single-quoted-scalar");
				break;
			default: setFlowScalarValue(token, source, "scalar");
		}
	}
	function setBlockScalarValue(token, source) {
		const he = source.indexOf("\n");
		const head = source.substring(0, he);
		const body = source.substring(he + 1) + "\n";
		if (token.type === "block-scalar") {
			const header = token.props[0];
			if (header.type !== "block-scalar-header") throw new Error("Invalid block scalar header");
			header.source = head;
			token.source = body;
		} else {
			const { offset } = token;
			const indent = "indent" in token ? token.indent : -1;
			const props = [{
				type: "block-scalar-header",
				offset,
				indent,
				source: head
			}];
			if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0)) props.push({
				type: "newline",
				offset: -1,
				indent,
				source: "\n"
			});
			for (const key of Object.keys(token)) if (key !== "type" && key !== "offset") delete token[key];
			Object.assign(token, {
				type: "block-scalar",
				indent,
				props,
				source: body
			});
		}
	}
	/** @returns `true` if last token is a newline */
	function addEndtoBlockProps(props, end) {
		if (end) for (const st of end) switch (st.type) {
			case "space":
			case "comment":
				props.push(st);
				break;
			case "newline":
				props.push(st);
				return true;
		}
		return false;
	}
	function setFlowScalarValue(token, source, type) {
		switch (token.type) {
			case "scalar":
			case "double-quoted-scalar":
			case "single-quoted-scalar":
				token.type = type;
				token.source = source;
				break;
			case "block-scalar": {
				const end = token.props.slice(1);
				let oa = source.length;
				if (token.props[0].type === "block-scalar-header") oa -= token.props[0].source.length;
				for (const tok of end) tok.offset += oa;
				delete token.props;
				Object.assign(token, {
					type,
					source,
					end
				});
				break;
			}
			case "block-map":
			case "block-seq": {
				const nl = {
					type: "newline",
					offset: token.offset + source.length,
					indent: token.indent,
					source: "\n"
				};
				delete token.items;
				Object.assign(token, {
					type,
					source,
					end: [nl]
				});
				break;
			}
			default: {
				const indent = "indent" in token ? token.indent : -1;
				const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
				for (const key of Object.keys(token)) if (key !== "type" && key !== "offset") delete token[key];
				Object.assign(token, {
					type,
					indent,
					source,
					end
				});
			}
		}
	}
	exports.createScalarToken = createScalarToken;
	exports.resolveAsScalar = resolveAsScalar;
	exports.setScalarValue = setScalarValue;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* Stringify a CST document, token, or collection item
	*
	* Fair warning: This applies no validation whatsoever, and
	* simply concatenates the sources in their logical order.
	*/
	const stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
	function stringifyToken(token) {
		switch (token.type) {
			case "block-scalar": {
				let res = "";
				for (const tok of token.props) res += stringifyToken(tok);
				return res + token.source;
			}
			case "block-map":
			case "block-seq": {
				let res = "";
				for (const item of token.items) res += stringifyItem(item);
				return res;
			}
			case "flow-collection": {
				let res = token.start.source;
				for (const item of token.items) res += stringifyItem(item);
				for (const st of token.end) res += st.source;
				return res;
			}
			case "document": {
				let res = stringifyItem(token);
				if (token.end) for (const st of token.end) res += st.source;
				return res;
			}
			default: {
				let res = token.source;
				if ("end" in token && token.end) for (const st of token.end) res += st.source;
				return res;
			}
		}
	}
	function stringifyItem({ start, key, sep, value }) {
		let res = "";
		for (const st of start) res += st.source;
		if (key) res += stringifyToken(key);
		if (sep) for (const st of sep) res += st.source;
		if (value) res += stringifyToken(value);
		return res;
	}
	exports.stringify = stringify;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = /* @__PURE__ */ __commonJSMin(((exports) => {
	const BREAK = Symbol("break visit");
	const SKIP = Symbol("skip children");
	const REMOVE = Symbol("remove item");
	/**
	* Apply a visitor to a CST document or item.
	*
	* Walks through the tree (depth-first) starting from the root, calling a
	* `visitor` function with two arguments when entering each item:
	*   - `item`: The current item, which included the following members:
	*     - `start: SourceToken[]` – Source tokens before the key or value,
	*       possibly including its anchor or tag.
	*     - `key?: Token | null` – Set for pair values. May then be `null`, if
	*       the key before the `:` separator is empty.
	*     - `sep?: SourceToken[]` – Source tokens between the key and the value,
	*       which should include the `:` map value indicator if `value` is set.
	*     - `value?: Token` – The value of a sequence item, or of a map pair.
	*   - `path`: The steps from the root to the current node, as an array of
	*     `['key' | 'value', number]` tuples.
	*
	* The return value of the visitor may be used to control the traversal:
	*   - `undefined` (default): Do nothing and continue
	*   - `visit.SKIP`: Do not visit the children of this token, continue with
	*      next sibling
	*   - `visit.BREAK`: Terminate traversal completely
	*   - `visit.REMOVE`: Remove the current item, then continue with the next one
	*   - `number`: Set the index of the next step. This is useful especially if
	*     the index of the current token has changed.
	*   - `function`: Define the next visitor for this item. After the original
	*     visitor is called on item entry, next visitors are called after handling
	*     a non-empty `key` and when exiting the item.
	*/
	function visit(cst, visitor) {
		if ("type" in cst && cst.type === "document") cst = {
			start: cst.start,
			value: cst.value
		};
		_visit(Object.freeze([]), cst, visitor);
	}
	/** Terminate visit traversal completely */
	visit.BREAK = BREAK;
	/** Do not visit the children of the current item */
	visit.SKIP = SKIP;
	/** Remove the current item */
	visit.REMOVE = REMOVE;
	/** Find the item at `path` from `cst` as the root */
	visit.itemAtPath = (cst, path) => {
		let item = cst;
		for (const [field, index] of path) {
			const tok = item?.[field];
			if (tok && "items" in tok) item = tok.items[index];
			else return void 0;
		}
		return item;
	};
	/**
	* Get the immediate parent collection of the item at `path` from `cst` as the root.
	*
	* Throws an error if the collection is not found, which should never happen if the item itself exists.
	*/
	visit.parentCollection = (cst, path) => {
		const parent = visit.itemAtPath(cst, path.slice(0, -1));
		const field = path[path.length - 1][0];
		const coll = parent?.[field];
		if (coll && "items" in coll) return coll;
		throw new Error("Parent collection not found");
	};
	function _visit(path, item, visitor) {
		let ctrl = visitor(item, path);
		if (typeof ctrl === "symbol") return ctrl;
		for (const field of ["key", "value"]) {
			const token = item[field];
			if (token && "items" in token) {
				for (let i = 0; i < token.items.length; ++i) {
					const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
					if (typeof ci === "number") i = ci - 1;
					else if (ci === BREAK) return BREAK;
					else if (ci === REMOVE) {
						token.items.splice(i, 1);
						i -= 1;
					}
				}
				if (typeof ctrl === "function" && field === "key") ctrl = ctrl(item, path);
			}
		}
		return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
	}
	exports.visit = visit;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/parse/cst.js
var require_cst = /* @__PURE__ */ __commonJSMin(((exports) => {
	var cstScalar = require_cst_scalar();
	var cstStringify = require_cst_stringify();
	var cstVisit = require_cst_visit();
	/** The byte order mark */
	const BOM = "﻿";
	/** Start of doc-mode */
	const DOCUMENT = "";
	/** Unexpected end of flow-mode */
	const FLOW_END = "";
	/** Next token is a scalar value */
	const SCALAR = "";
	/** @returns `true` if `token` is a flow or block collection */
	const isCollection = (token) => !!token && "items" in token;
	/** @returns `true` if `token` is a flow or block scalar; not an alias */
	const isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
	/* istanbul ignore next */
	/** Get a printable representation of a lexer token */
	function prettyToken(token) {
		switch (token) {
			case BOM: return "<BOM>";
			case DOCUMENT: return "<DOC>";
			case FLOW_END: return "<FLOW_END>";
			case SCALAR: return "<SCALAR>";
			default: return JSON.stringify(token);
		}
	}
	/** Identify the type of a lexer token. May return `null` for unknown tokens. */
	function tokenType(source) {
		switch (source) {
			case BOM: return "byte-order-mark";
			case DOCUMENT: return "doc-mode";
			case FLOW_END: return "flow-error-end";
			case SCALAR: return "scalar";
			case "---": return "doc-start";
			case "...": return "doc-end";
			case "":
			case "\n":
			case "\r\n": return "newline";
			case "-": return "seq-item-ind";
			case "?": return "explicit-key-ind";
			case ":": return "map-value-ind";
			case "{": return "flow-map-start";
			case "}": return "flow-map-end";
			case "[": return "flow-seq-start";
			case "]": return "flow-seq-end";
			case ",": return "comma";
		}
		switch (source[0]) {
			case " ":
			case "	": return "space";
			case "#": return "comment";
			case "%": return "directive-line";
			case "*": return "alias";
			case "&": return "anchor";
			case "!": return "tag";
			case "'": return "single-quoted-scalar";
			case "\"": return "double-quoted-scalar";
			case "|":
			case ">": return "block-scalar-header";
		}
		return null;
	}
	exports.createScalarToken = cstScalar.createScalarToken;
	exports.resolveAsScalar = cstScalar.resolveAsScalar;
	exports.setScalarValue = cstScalar.setScalarValue;
	exports.stringify = cstStringify.stringify;
	exports.visit = cstVisit.visit;
	exports.BOM = BOM;
	exports.DOCUMENT = DOCUMENT;
	exports.FLOW_END = FLOW_END;
	exports.SCALAR = SCALAR;
	exports.isCollection = isCollection;
	exports.isScalar = isScalar;
	exports.prettyToken = prettyToken;
	exports.tokenType = tokenType;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/parse/lexer.js
var require_lexer = /* @__PURE__ */ __commonJSMin(((exports) => {
	var cst = require_cst();
	function isEmpty(ch) {
		switch (ch) {
			case void 0:
			case " ":
			case "\n":
			case "\r":
			case "	": return true;
			default: return false;
		}
	}
	const hexDigits = /* @__PURE__ */ new Set("0123456789ABCDEFabcdef");
	const tagChars = /* @__PURE__ */ new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
	const flowIndicatorChars = /* @__PURE__ */ new Set(",[]{}");
	const invalidAnchorChars = /* @__PURE__ */ new Set(" ,[]{}\n\r	");
	const isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
	/**
	* Splits an input string into lexical tokens, i.e. smaller strings that are
	* easily identifiable by `tokens.tokenType()`.
	*
	* Lexing starts always in a "stream" context. Incomplete input may be buffered
	* until a complete token can be emitted.
	*
	* In addition to slices of the original input, the following control characters
	* may also be emitted:
	*
	* - `\x02` (Start of Text): A document starts with the next token
	* - `\x18` (Cancel): Unexpected end of flow-mode (indicates an error)
	* - `\x1f` (Unit Separator): Next token is a scalar value
	* - `\u{FEFF}` (Byte order mark): Emitted separately outside documents
	*/
	var Lexer = class {
		constructor() {
			/**
			* Flag indicating whether the end of the current buffer marks the end of
			* all input
			*/
			this.atEnd = false;
			/**
			* Explicit indent set in block scalar header, as an offset from the current
			* minimum indent, so e.g. set to 1 from a header `|2+`. Set to -1 if not
			* explicitly set.
			*/
			this.blockScalarIndent = -1;
			/**
			* Block scalars that include a + (keep) chomping indicator in their header
			* include trailing empty lines, which are otherwise excluded from the
			* scalar's contents.
			*/
			this.blockScalarKeep = false;
			/** Current input */
			this.buffer = "";
			/**
			* Flag noting whether the map value indicator : can immediately follow this
			* node within a flow context.
			*/
			this.flowKey = false;
			/** Count of surrounding flow collection levels. */
			this.flowLevel = 0;
			/**
			* Minimum level of indentation required for next lines to be parsed as a
			* part of the current scalar value.
			*/
			this.indentNext = 0;
			/** Indentation level of the current line. */
			this.indentValue = 0;
			/** Position of the next \n character. */
			this.lineEndPos = null;
			/** Stores the state of the lexer if reaching the end of incpomplete input */
			this.next = null;
			/** A pointer to `buffer`; the current position of the lexer. */
			this.pos = 0;
		}
		/**
		* Generate YAML tokens from the `source` string. If `incomplete`,
		* a part of the last line may be left as a buffer for the next call.
		*
		* @returns A generator of lexical tokens
		*/
		*lex(source, incomplete = false) {
			if (source) {
				if (typeof source !== "string") throw TypeError("source is not a string");
				this.buffer = this.buffer ? this.buffer + source : source;
				this.lineEndPos = null;
			}
			this.atEnd = !incomplete;
			let next = this.next ?? "stream";
			while (next && (incomplete || this.hasChars(1))) next = yield* this.parseNext(next);
		}
		atLineEnd() {
			let i = this.pos;
			let ch = this.buffer[i];
			while (ch === " " || ch === "	") ch = this.buffer[++i];
			if (!ch || ch === "#" || ch === "\n") return true;
			if (ch === "\r") return this.buffer[i + 1] === "\n";
			return false;
		}
		charAt(n) {
			return this.buffer[this.pos + n];
		}
		continueScalar(offset) {
			let ch = this.buffer[offset];
			if (this.indentNext > 0) {
				let indent = 0;
				while (ch === " ") ch = this.buffer[++indent + offset];
				if (ch === "\r") {
					const next = this.buffer[indent + offset + 1];
					if (next === "\n" || !next && !this.atEnd) return offset + indent + 1;
				}
				return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
			}
			if (ch === "-" || ch === ".") {
				const dt = this.buffer.substr(offset, 3);
				if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3])) return -1;
			}
			return offset;
		}
		getLine() {
			let end = this.lineEndPos;
			if (typeof end !== "number" || end !== -1 && end < this.pos) {
				end = this.buffer.indexOf("\n", this.pos);
				this.lineEndPos = end;
			}
			if (end === -1) return this.atEnd ? this.buffer.substring(this.pos) : null;
			if (this.buffer[end - 1] === "\r") end -= 1;
			return this.buffer.substring(this.pos, end);
		}
		hasChars(n) {
			return this.pos + n <= this.buffer.length;
		}
		setNext(state) {
			this.buffer = this.buffer.substring(this.pos);
			this.pos = 0;
			this.lineEndPos = null;
			this.next = state;
			return null;
		}
		peek(n) {
			return this.buffer.substr(this.pos, n);
		}
		*parseNext(next) {
			switch (next) {
				case "stream": return yield* this.parseStream();
				case "line-start": return yield* this.parseLineStart();
				case "block-start": return yield* this.parseBlockStart();
				case "doc": return yield* this.parseDocument();
				case "flow": return yield* this.parseFlowCollection();
				case "quoted-scalar": return yield* this.parseQuotedScalar();
				case "block-scalar": return yield* this.parseBlockScalar();
				case "plain-scalar": return yield* this.parsePlainScalar();
			}
		}
		*parseStream() {
			let line = this.getLine();
			if (line === null) return this.setNext("stream");
			if (line[0] === cst.BOM) {
				yield* this.pushCount(1);
				line = line.substring(1);
			}
			if (line[0] === "%") {
				let dirEnd = line.length;
				let cs = line.indexOf("#");
				while (cs !== -1) {
					const ch = line[cs - 1];
					if (ch === " " || ch === "	") {
						dirEnd = cs - 1;
						break;
					} else cs = line.indexOf("#", cs + 1);
				}
				while (true) {
					const ch = line[dirEnd - 1];
					if (ch === " " || ch === "	") dirEnd -= 1;
					else break;
				}
				const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
				yield* this.pushCount(line.length - n);
				this.pushNewline();
				return "stream";
			}
			if (this.atLineEnd()) {
				const sp = yield* this.pushSpaces(true);
				yield* this.pushCount(line.length - sp);
				yield* this.pushNewline();
				return "stream";
			}
			yield cst.DOCUMENT;
			return yield* this.parseLineStart();
		}
		*parseLineStart() {
			const ch = this.charAt(0);
			if (!ch && !this.atEnd) return this.setNext("line-start");
			if (ch === "-" || ch === ".") {
				if (!this.atEnd && !this.hasChars(4)) return this.setNext("line-start");
				const s = this.peek(3);
				if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
					yield* this.pushCount(3);
					this.indentValue = 0;
					this.indentNext = 0;
					return s === "---" ? "doc" : "stream";
				}
			}
			this.indentValue = yield* this.pushSpaces(false);
			if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1))) this.indentNext = this.indentValue;
			return yield* this.parseBlockStart();
		}
		*parseBlockStart() {
			const [ch0, ch1] = this.peek(2);
			if (!ch1 && !this.atEnd) return this.setNext("block-start");
			if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
				const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
				this.indentNext = this.indentValue + 1;
				this.indentValue += n;
				return "block-start";
			}
			return "doc";
		}
		*parseDocument() {
			yield* this.pushSpaces(true);
			const line = this.getLine();
			if (line === null) return this.setNext("doc");
			let n = yield* this.pushIndicators();
			switch (line[n]) {
				case "#": yield* this.pushCount(line.length - n);
				case void 0:
					yield* this.pushNewline();
					return yield* this.parseLineStart();
				case "{":
				case "[":
					yield* this.pushCount(1);
					this.flowKey = false;
					this.flowLevel = 1;
					return "flow";
				case "}":
				case "]":
					yield* this.pushCount(1);
					return "doc";
				case "*":
					yield* this.pushUntil(isNotAnchorChar);
					return "doc";
				case "\"":
				case "'": return yield* this.parseQuotedScalar();
				case "|":
				case ">":
					n += yield* this.parseBlockScalarHeader();
					n += yield* this.pushSpaces(true);
					yield* this.pushCount(line.length - n);
					yield* this.pushNewline();
					return yield* this.parseBlockScalar();
				default: return yield* this.parsePlainScalar();
			}
		}
		*parseFlowCollection() {
			let nl, sp;
			let indent = -1;
			do {
				nl = yield* this.pushNewline();
				if (nl > 0) {
					sp = yield* this.pushSpaces(false);
					this.indentValue = indent = sp;
				} else sp = 0;
				sp += yield* this.pushSpaces(true);
			} while (nl + sp > 0);
			const line = this.getLine();
			if (line === null) return this.setNext("flow");
			if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
				if (!(indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}"))) {
					this.flowLevel = 0;
					yield cst.FLOW_END;
					return yield* this.parseLineStart();
				}
			}
			let n = 0;
			while (line[n] === ",") {
				n += yield* this.pushCount(1);
				n += yield* this.pushSpaces(true);
				this.flowKey = false;
			}
			n += yield* this.pushIndicators();
			switch (line[n]) {
				case void 0: return "flow";
				case "#":
					yield* this.pushCount(line.length - n);
					return "flow";
				case "{":
				case "[":
					yield* this.pushCount(1);
					this.flowKey = false;
					this.flowLevel += 1;
					return "flow";
				case "}":
				case "]":
					yield* this.pushCount(1);
					this.flowKey = true;
					this.flowLevel -= 1;
					return this.flowLevel ? "flow" : "doc";
				case "*":
					yield* this.pushUntil(isNotAnchorChar);
					return "flow";
				case "\"":
				case "'":
					this.flowKey = true;
					return yield* this.parseQuotedScalar();
				case ":": {
					const next = this.charAt(1);
					if (this.flowKey || isEmpty(next) || next === ",") {
						this.flowKey = false;
						yield* this.pushCount(1);
						yield* this.pushSpaces(true);
						return "flow";
					}
				}
				default:
					this.flowKey = false;
					return yield* this.parsePlainScalar();
			}
		}
		*parseQuotedScalar() {
			const quote = this.charAt(0);
			let end = this.buffer.indexOf(quote, this.pos + 1);
			if (quote === "'") while (end !== -1 && this.buffer[end + 1] === "'") end = this.buffer.indexOf("'", end + 2);
			else while (end !== -1) {
				let n = 0;
				while (this.buffer[end - 1 - n] === "\\") n += 1;
				if (n % 2 === 0) break;
				end = this.buffer.indexOf("\"", end + 1);
			}
			const qb = this.buffer.substring(0, end);
			let nl = qb.indexOf("\n", this.pos);
			if (nl !== -1) {
				while (nl !== -1) {
					const cs = this.continueScalar(nl + 1);
					if (cs === -1) break;
					nl = qb.indexOf("\n", cs);
				}
				if (nl !== -1) end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
			}
			if (end === -1) {
				if (!this.atEnd) return this.setNext("quoted-scalar");
				end = this.buffer.length;
			}
			yield* this.pushToIndex(end + 1, false);
			return this.flowLevel ? "flow" : "doc";
		}
		*parseBlockScalarHeader() {
			this.blockScalarIndent = -1;
			this.blockScalarKeep = false;
			let i = this.pos;
			while (true) {
				const ch = this.buffer[++i];
				if (ch === "+") this.blockScalarKeep = true;
				else if (ch > "0" && ch <= "9") this.blockScalarIndent = Number(ch) - 1;
				else if (ch !== "-") break;
			}
			return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
		}
		*parseBlockScalar() {
			let nl = this.pos - 1;
			let indent = 0;
			let ch;
			loop: for (let i = this.pos; ch = this.buffer[i]; ++i) switch (ch) {
				case " ":
					indent += 1;
					break;
				case "\n":
					nl = i;
					indent = 0;
					break;
				case "\r": {
					const next = this.buffer[i + 1];
					if (!next && !this.atEnd) return this.setNext("block-scalar");
					if (next === "\n") break;
				}
				default: break loop;
			}
			if (!ch && !this.atEnd) return this.setNext("block-scalar");
			if (indent >= this.indentNext) {
				if (this.blockScalarIndent === -1) this.indentNext = indent;
				else this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
				do {
					const cs = this.continueScalar(nl + 1);
					if (cs === -1) break;
					nl = this.buffer.indexOf("\n", cs);
				} while (nl !== -1);
				if (nl === -1) {
					if (!this.atEnd) return this.setNext("block-scalar");
					nl = this.buffer.length;
				}
			}
			let i = nl + 1;
			ch = this.buffer[i];
			while (ch === " ") ch = this.buffer[++i];
			if (ch === "	") {
				while (ch === "	" || ch === " " || ch === "\r" || ch === "\n") ch = this.buffer[++i];
				nl = i - 1;
			} else if (!this.blockScalarKeep) do {
				let i = nl - 1;
				let ch = this.buffer[i];
				if (ch === "\r") ch = this.buffer[--i];
				const lastChar = i;
				while (ch === " ") ch = this.buffer[--i];
				if (ch === "\n" && i >= this.pos && i + 1 + indent > lastChar) nl = i;
				else break;
			} while (true);
			yield cst.SCALAR;
			yield* this.pushToIndex(nl + 1, true);
			return yield* this.parseLineStart();
		}
		*parsePlainScalar() {
			const inFlow = this.flowLevel > 0;
			let end = this.pos - 1;
			let i = this.pos - 1;
			let ch;
			while (ch = this.buffer[++i]) if (ch === ":") {
				const next = this.buffer[i + 1];
				if (isEmpty(next) || inFlow && flowIndicatorChars.has(next)) break;
				end = i;
			} else if (isEmpty(ch)) {
				let next = this.buffer[i + 1];
				if (ch === "\r") {
					if (next === "\n") {
						i += 1;
						ch = "\n";
						next = this.buffer[i + 1];
					} else end = i;
				}
				if (next === "#" || inFlow && flowIndicatorChars.has(next)) break;
				if (ch === "\n") {
					const cs = this.continueScalar(i + 1);
					if (cs === -1) break;
					i = Math.max(i, cs - 2);
				}
			} else {
				if (inFlow && flowIndicatorChars.has(ch)) break;
				end = i;
			}
			if (!ch && !this.atEnd) return this.setNext("plain-scalar");
			yield cst.SCALAR;
			yield* this.pushToIndex(end + 1, true);
			return inFlow ? "flow" : "doc";
		}
		*pushCount(n) {
			if (n > 0) {
				yield this.buffer.substr(this.pos, n);
				this.pos += n;
				return n;
			}
			return 0;
		}
		*pushToIndex(i, allowEmpty) {
			const s = this.buffer.slice(this.pos, i);
			if (s) {
				yield s;
				this.pos += s.length;
				return s.length;
			} else if (allowEmpty) yield "";
			return 0;
		}
		*pushIndicators() {
			let n = 0;
			loop: while (true) {
				switch (this.charAt(0)) {
					case "!":
						n += yield* this.pushTag();
						n += yield* this.pushSpaces(true);
						continue loop;
					case "&":
						n += yield* this.pushUntil(isNotAnchorChar);
						n += yield* this.pushSpaces(true);
						continue loop;
					case "-":
					case "?":
					case ":": {
						const inFlow = this.flowLevel > 0;
						const ch1 = this.charAt(1);
						if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
							if (!inFlow) this.indentNext = this.indentValue + 1;
							else if (this.flowKey) this.flowKey = false;
							n += yield* this.pushCount(1);
							n += yield* this.pushSpaces(true);
							continue loop;
						}
					}
				}
				break loop;
			}
			return n;
		}
		*pushTag() {
			if (this.charAt(1) === "<") {
				let i = this.pos + 2;
				let ch = this.buffer[i];
				while (!isEmpty(ch) && ch !== ">") ch = this.buffer[++i];
				return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
			} else {
				let i = this.pos + 1;
				let ch = this.buffer[i];
				while (ch) if (tagChars.has(ch)) ch = this.buffer[++i];
				else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) ch = this.buffer[i += 3];
				else break;
				return yield* this.pushToIndex(i, false);
			}
		}
		*pushNewline() {
			const ch = this.buffer[this.pos];
			if (ch === "\n") return yield* this.pushCount(1);
			else if (ch === "\r" && this.charAt(1) === "\n") return yield* this.pushCount(2);
			else return 0;
		}
		*pushSpaces(allowTabs) {
			let i = this.pos - 1;
			let ch;
			do
				ch = this.buffer[++i];
			while (ch === " " || allowTabs && ch === "	");
			const n = i - this.pos;
			if (n > 0) {
				yield this.buffer.substr(this.pos, n);
				this.pos = i;
			}
			return n;
		}
		*pushUntil(test) {
			let i = this.pos;
			let ch = this.buffer[i];
			while (!test(ch)) ch = this.buffer[++i];
			return yield* this.pushToIndex(i, false);
		}
	};
	exports.Lexer = Lexer;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* Tracks newlines during parsing in order to provide an efficient API for
	* determining the one-indexed `{ line, col }` position for any offset
	* within the input.
	*/
	var LineCounter = class {
		constructor() {
			this.lineStarts = [];
			/**
			* Should be called in ascending order. Otherwise, call
			* `lineCounter.lineStarts.sort()` before calling `linePos()`.
			*/
			this.addNewLine = (offset) => this.lineStarts.push(offset);
			/**
			* Performs a binary search and returns the 1-indexed { line, col }
			* position of `offset`. If `line === 0`, `addNewLine` has never been
			* called or `offset` is before the first known newline.
			*/
			this.linePos = (offset) => {
				let low = 0;
				let high = this.lineStarts.length;
				while (low < high) {
					const mid = low + high >> 1;
					if (this.lineStarts[mid] < offset) low = mid + 1;
					else high = mid;
				}
				if (this.lineStarts[low] === offset) return {
					line: low + 1,
					col: 1
				};
				if (low === 0) return {
					line: 0,
					col: offset
				};
				const start = this.lineStarts[low - 1];
				return {
					line: low,
					col: offset - start + 1
				};
			};
		}
	};
	exports.LineCounter = LineCounter;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/parse/parser.js
var require_parser = /* @__PURE__ */ __commonJSMin(((exports) => {
	var node_process = __require("process");
	var cst = require_cst();
	var lexer = require_lexer();
	function includesToken(list, type) {
		for (let i = 0; i < list.length; ++i) if (list[i].type === type) return true;
		return false;
	}
	function findNonEmptyIndex(list) {
		for (let i = 0; i < list.length; ++i) switch (list[i].type) {
			case "space":
			case "comment":
			case "newline": break;
			default: return i;
		}
		return -1;
	}
	function isFlowToken(token) {
		switch (token?.type) {
			case "alias":
			case "scalar":
			case "single-quoted-scalar":
			case "double-quoted-scalar":
			case "flow-collection": return true;
			default: return false;
		}
	}
	function getPrevProps(parent) {
		switch (parent.type) {
			case "document": return parent.start;
			case "block-map": {
				const it = parent.items[parent.items.length - 1];
				return it.sep ?? it.start;
			}
			case "block-seq": return parent.items[parent.items.length - 1].start;
			/* istanbul ignore next should not happen */
			default: return [];
		}
	}
	/** Note: May modify input array */
	function getFirstKeyStartProps(prev) {
		if (prev.length === 0) return [];
		let i = prev.length;
		loop: while (--i >= 0) switch (prev[i].type) {
			case "doc-start":
			case "explicit-key-ind":
			case "map-value-ind":
			case "seq-item-ind":
			case "newline": break loop;
		}
		while (prev[++i]?.type === "space");
		return prev.splice(i, prev.length);
	}
	function arrayPushArray(target, source) {
		if (source.length < 1e5) Array.prototype.push.apply(target, source);
		else for (let i = 0; i < source.length; ++i) target.push(source[i]);
	}
	function fixFlowSeqItems(fc) {
		if (fc.start.type === "flow-seq-start") {
			for (const it of fc.items) if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
				if (it.key) it.value = it.key;
				delete it.key;
				if (isFlowToken(it.value)) {
					if (it.value.end) arrayPushArray(it.value.end, it.sep);
					else it.value.end = it.sep;
				} else arrayPushArray(it.start, it.sep);
				delete it.sep;
			}
		}
	}
	/**
	* A YAML concrete syntax tree (CST) parser
	*
	* ```ts
	* const src: string = ...
	* for (const token of new Parser().parse(src)) {
	*   // token: Token
	* }
	* ```
	*
	* To use the parser with a user-provided lexer:
	*
	* ```ts
	* function* parse(source: string, lexer: Lexer) {
	*   const parser = new Parser()
	*   for (const lexeme of lexer.lex(source))
	*     yield* parser.next(lexeme)
	*   yield* parser.end()
	* }
	*
	* const src: string = ...
	* const lexer = new Lexer()
	* for (const token of parse(src, lexer)) {
	*   // token: Token
	* }
	* ```
	*/
	var Parser = class {
		/**
		* @param onNewLine - If defined, called separately with the start position of
		*   each new line (in `parse()`, including the start of input).
		*/
		constructor(onNewLine) {
			/** If true, space and sequence indicators count as indentation */
			this.atNewLine = true;
			/** If true, next token is a scalar value */
			this.atScalar = false;
			/** Current indentation level */
			this.indent = 0;
			/** Current offset since the start of parsing */
			this.offset = 0;
			/** On the same line with a block map key */
			this.onKeyLine = false;
			/** Top indicates the node that's currently being built */
			this.stack = [];
			/** The source of the current token, set in parse() */
			this.source = "";
			/** The type of the current token, set in parse() */
			this.type = "";
			this.lexer = new lexer.Lexer();
			this.onNewLine = onNewLine;
		}
		/**
		* Parse `source` as a YAML stream.
		* If `incomplete`, a part of the last line may be left as a buffer for the next call.
		*
		* Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
		*
		* @returns A generator of tokens representing each directive, document, and other structure.
		*/
		*parse(source, incomplete = false) {
			if (this.onNewLine && this.offset === 0) this.onNewLine(0);
			for (const lexeme of this.lexer.lex(source, incomplete)) yield* this.next(lexeme);
			if (!incomplete) yield* this.end();
		}
		/**
		* Advance the parser by the `source` of one lexical token.
		*/
		*next(source) {
			this.source = source;
			if (node_process.env.LOG_TOKENS) console.log("|", cst.prettyToken(source));
			if (this.atScalar) {
				this.atScalar = false;
				yield* this.step();
				this.offset += source.length;
				return;
			}
			const type = cst.tokenType(source);
			if (!type) {
				const message = `Not a YAML token: ${source}`;
				yield* this.pop({
					type: "error",
					offset: this.offset,
					message,
					source
				});
				this.offset += source.length;
			} else if (type === "scalar") {
				this.atNewLine = false;
				this.atScalar = true;
				this.type = "scalar";
			} else {
				this.type = type;
				yield* this.step();
				switch (type) {
					case "newline":
						this.atNewLine = true;
						this.indent = 0;
						if (this.onNewLine) this.onNewLine(this.offset + source.length);
						break;
					case "space":
						if (this.atNewLine && source[0] === " ") this.indent += source.length;
						break;
					case "explicit-key-ind":
					case "map-value-ind":
					case "seq-item-ind":
						if (this.atNewLine) this.indent += source.length;
						break;
					case "doc-mode":
					case "flow-error-end": return;
					default: this.atNewLine = false;
				}
				this.offset += source.length;
			}
		}
		/** Call at end of input to push out any remaining constructions */
		*end() {
			while (this.stack.length > 0) yield* this.pop();
		}
		get sourceToken() {
			return {
				type: this.type,
				offset: this.offset,
				indent: this.indent,
				source: this.source
			};
		}
		*step() {
			const top = this.peek(1);
			if (this.type === "doc-end" && top?.type !== "doc-end") {
				while (this.stack.length > 0) yield* this.pop();
				this.stack.push({
					type: "doc-end",
					offset: this.offset,
					source: this.source
				});
				return;
			}
			if (!top) return yield* this.stream();
			switch (top.type) {
				case "document": return yield* this.document(top);
				case "alias":
				case "scalar":
				case "single-quoted-scalar":
				case "double-quoted-scalar": return yield* this.scalar(top);
				case "block-scalar": return yield* this.blockScalar(top);
				case "block-map": return yield* this.blockMap(top);
				case "block-seq": return yield* this.blockSequence(top);
				case "flow-collection": return yield* this.flowCollection(top);
				case "doc-end": return yield* this.documentEnd(top);
			}
			/* istanbul ignore next should not happen */
			yield* this.pop();
		}
		peek(n) {
			return this.stack[this.stack.length - n];
		}
		*pop(error) {
			const token = error ?? this.stack.pop();
			/* istanbul ignore if should not happen */
			if (!token) yield {
				type: "error",
				offset: this.offset,
				source: "",
				message: "Tried to pop an empty stack"
			};
			else if (this.stack.length === 0) yield token;
			else {
				const top = this.peek(1);
				if (token.type === "block-scalar") token.indent = "indent" in top ? top.indent : 0;
				else if (token.type === "flow-collection" && top.type === "document") token.indent = 0;
				if (token.type === "flow-collection") fixFlowSeqItems(token);
				switch (top.type) {
					case "document":
						top.value = token;
						break;
					case "block-scalar":
						top.props.push(token);
						break;
					case "block-map": {
						const it = top.items[top.items.length - 1];
						if (it.value) {
							top.items.push({
								start: [],
								key: token,
								sep: []
							});
							this.onKeyLine = true;
							return;
						} else if (it.sep) it.value = token;
						else {
							Object.assign(it, {
								key: token,
								sep: []
							});
							this.onKeyLine = !it.explicitKey;
							return;
						}
						break;
					}
					case "block-seq": {
						const it = top.items[top.items.length - 1];
						if (it.value) top.items.push({
							start: [],
							value: token
						});
						else it.value = token;
						break;
					}
					case "flow-collection": {
						const it = top.items[top.items.length - 1];
						if (!it || it.value) top.items.push({
							start: [],
							key: token,
							sep: []
						});
						else if (it.sep) it.value = token;
						else Object.assign(it, {
							key: token,
							sep: []
						});
						return;
					}
					/* istanbul ignore next should not happen */
					default:
						yield* this.pop();
						yield* this.pop(token);
				}
				if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
					const last = token.items[token.items.length - 1];
					if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
						if (top.type === "document") top.end = last.start;
						else top.items.push({ start: last.start });
						token.items.splice(-1, 1);
					}
				}
			}
		}
		*stream() {
			switch (this.type) {
				case "directive-line":
					yield {
						type: "directive",
						offset: this.offset,
						source: this.source
					};
					return;
				case "byte-order-mark":
				case "space":
				case "comment":
				case "newline":
					yield this.sourceToken;
					return;
				case "doc-mode":
				case "doc-start": {
					const doc = {
						type: "document",
						offset: this.offset,
						start: []
					};
					if (this.type === "doc-start") doc.start.push(this.sourceToken);
					this.stack.push(doc);
					return;
				}
			}
			yield {
				type: "error",
				offset: this.offset,
				message: `Unexpected ${this.type} token in YAML stream`,
				source: this.source
			};
		}
		*document(doc) {
			if (doc.value) return yield* this.lineEnd(doc);
			switch (this.type) {
				case "doc-start":
					if (findNonEmptyIndex(doc.start) !== -1) {
						yield* this.pop();
						yield* this.step();
					} else doc.start.push(this.sourceToken);
					return;
				case "anchor":
				case "tag":
				case "space":
				case "comment":
				case "newline":
					doc.start.push(this.sourceToken);
					return;
			}
			const bv = this.startBlockValue(doc);
			if (bv) this.stack.push(bv);
			else yield {
				type: "error",
				offset: this.offset,
				message: `Unexpected ${this.type} token in YAML document`,
				source: this.source
			};
		}
		*scalar(scalar) {
			if (this.type === "map-value-ind") {
				const start = getFirstKeyStartProps(getPrevProps(this.peek(2)));
				let sep;
				if (scalar.end) {
					sep = scalar.end;
					sep.push(this.sourceToken);
					delete scalar.end;
				} else sep = [this.sourceToken];
				const map = {
					type: "block-map",
					offset: scalar.offset,
					indent: scalar.indent,
					items: [{
						start,
						key: scalar,
						sep
					}]
				};
				this.onKeyLine = true;
				this.stack[this.stack.length - 1] = map;
			} else yield* this.lineEnd(scalar);
		}
		*blockScalar(scalar) {
			switch (this.type) {
				case "space":
				case "comment":
				case "newline":
					scalar.props.push(this.sourceToken);
					return;
				case "scalar":
					scalar.source = this.source;
					this.atNewLine = true;
					this.indent = 0;
					if (this.onNewLine) {
						let nl = this.source.indexOf("\n") + 1;
						while (nl !== 0) {
							this.onNewLine(this.offset + nl);
							nl = this.source.indexOf("\n", nl) + 1;
						}
					}
					yield* this.pop();
					break;
				/* istanbul ignore next should not happen */
				default:
					yield* this.pop();
					yield* this.step();
			}
		}
		*blockMap(map) {
			const it = map.items[map.items.length - 1];
			switch (this.type) {
				case "newline":
					this.onKeyLine = false;
					if (it.value) {
						const end = "end" in it.value ? it.value.end : void 0;
						if ((Array.isArray(end) ? end[end.length - 1] : void 0)?.type === "comment") end?.push(this.sourceToken);
						else map.items.push({ start: [this.sourceToken] });
					} else if (it.sep) it.sep.push(this.sourceToken);
					else it.start.push(this.sourceToken);
					return;
				case "space":
				case "comment":
					if (it.value) map.items.push({ start: [this.sourceToken] });
					else if (it.sep) it.sep.push(this.sourceToken);
					else {
						if (this.atIndentedComment(it.start, map.indent)) {
							const end = map.items[map.items.length - 2]?.value?.end;
							if (Array.isArray(end)) {
								arrayPushArray(end, it.start);
								end.push(this.sourceToken);
								map.items.pop();
								return;
							}
						}
						it.start.push(this.sourceToken);
					}
					return;
			}
			if (this.indent >= map.indent) {
				const atMapIndent = !this.onKeyLine && this.indent === map.indent;
				const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
				let start = [];
				if (atNextItem && it.sep && !it.value) {
					const nl = [];
					for (let i = 0; i < it.sep.length; ++i) {
						const st = it.sep[i];
						switch (st.type) {
							case "newline":
								nl.push(i);
								break;
							case "space": break;
							case "comment":
								if (st.indent > map.indent) nl.length = 0;
								break;
							default: nl.length = 0;
						}
					}
					if (nl.length >= 2) start = it.sep.splice(nl[1]);
				}
				switch (this.type) {
					case "anchor":
					case "tag":
						if (atNextItem || it.value) {
							start.push(this.sourceToken);
							map.items.push({ start });
							this.onKeyLine = true;
						} else if (it.sep) it.sep.push(this.sourceToken);
						else it.start.push(this.sourceToken);
						return;
					case "explicit-key-ind":
						if (!it.sep && !it.explicitKey) {
							it.start.push(this.sourceToken);
							it.explicitKey = true;
						} else if (atNextItem || it.value) {
							start.push(this.sourceToken);
							map.items.push({
								start,
								explicitKey: true
							});
						} else this.stack.push({
							type: "block-map",
							offset: this.offset,
							indent: this.indent,
							items: [{
								start: [this.sourceToken],
								explicitKey: true
							}]
						});
						this.onKeyLine = true;
						return;
					case "map-value-ind":
						if (it.explicitKey) {
							if (!it.sep) {
								if (includesToken(it.start, "newline")) Object.assign(it, {
									key: null,
									sep: [this.sourceToken]
								});
								else {
									const start = getFirstKeyStartProps(it.start);
									this.stack.push({
										type: "block-map",
										offset: this.offset,
										indent: this.indent,
										items: [{
											start,
											key: null,
											sep: [this.sourceToken]
										}]
									});
								}
							} else if (it.value) map.items.push({
								start: [],
								key: null,
								sep: [this.sourceToken]
							});
							else if (includesToken(it.sep, "map-value-ind")) this.stack.push({
								type: "block-map",
								offset: this.offset,
								indent: this.indent,
								items: [{
									start,
									key: null,
									sep: [this.sourceToken]
								}]
							});
							else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
								const start = getFirstKeyStartProps(it.start);
								const key = it.key;
								const sep = it.sep;
								sep.push(this.sourceToken);
								delete it.key;
								delete it.sep;
								this.stack.push({
									type: "block-map",
									offset: this.offset,
									indent: this.indent,
									items: [{
										start,
										key,
										sep
									}]
								});
							} else if (start.length > 0) it.sep = it.sep.concat(start, this.sourceToken);
							else it.sep.push(this.sourceToken);
						} else if (!it.sep) Object.assign(it, {
							key: null,
							sep: [this.sourceToken]
						});
						else if (it.value || atNextItem) map.items.push({
							start,
							key: null,
							sep: [this.sourceToken]
						});
						else if (includesToken(it.sep, "map-value-ind")) this.stack.push({
							type: "block-map",
							offset: this.offset,
							indent: this.indent,
							items: [{
								start: [],
								key: null,
								sep: [this.sourceToken]
							}]
						});
						else it.sep.push(this.sourceToken);
						this.onKeyLine = true;
						return;
					case "alias":
					case "scalar":
					case "single-quoted-scalar":
					case "double-quoted-scalar": {
						const fs = this.flowScalar(this.type);
						if (atNextItem || it.value) {
							map.items.push({
								start,
								key: fs,
								sep: []
							});
							this.onKeyLine = true;
						} else if (it.sep) this.stack.push(fs);
						else {
							Object.assign(it, {
								key: fs,
								sep: []
							});
							this.onKeyLine = true;
						}
						return;
					}
					default: {
						const bv = this.startBlockValue(map);
						if (bv) {
							if (bv.type === "block-seq") {
								if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
									yield* this.pop({
										type: "error",
										offset: this.offset,
										message: "Unexpected block-seq-ind on same line with key",
										source: this.source
									});
									return;
								}
							} else if (atMapIndent) map.items.push({ start });
							this.stack.push(bv);
							return;
						}
					}
				}
			}
			yield* this.pop();
			yield* this.step();
		}
		*blockSequence(seq) {
			const it = seq.items[seq.items.length - 1];
			switch (this.type) {
				case "newline":
					if (it.value) {
						const end = "end" in it.value ? it.value.end : void 0;
						if ((Array.isArray(end) ? end[end.length - 1] : void 0)?.type === "comment") end?.push(this.sourceToken);
						else seq.items.push({ start: [this.sourceToken] });
					} else it.start.push(this.sourceToken);
					return;
				case "space":
				case "comment":
					if (it.value) seq.items.push({ start: [this.sourceToken] });
					else {
						if (this.atIndentedComment(it.start, seq.indent)) {
							const end = seq.items[seq.items.length - 2]?.value?.end;
							if (Array.isArray(end)) {
								arrayPushArray(end, it.start);
								end.push(this.sourceToken);
								seq.items.pop();
								return;
							}
						}
						it.start.push(this.sourceToken);
					}
					return;
				case "anchor":
				case "tag":
					if (it.value || this.indent <= seq.indent) break;
					it.start.push(this.sourceToken);
					return;
				case "seq-item-ind":
					if (this.indent !== seq.indent) break;
					if (it.value || includesToken(it.start, "seq-item-ind")) seq.items.push({ start: [this.sourceToken] });
					else it.start.push(this.sourceToken);
					return;
			}
			if (this.indent > seq.indent) {
				const bv = this.startBlockValue(seq);
				if (bv) {
					this.stack.push(bv);
					return;
				}
			}
			yield* this.pop();
			yield* this.step();
		}
		*flowCollection(fc) {
			const it = fc.items[fc.items.length - 1];
			if (this.type === "flow-error-end") {
				let top;
				do {
					yield* this.pop();
					top = this.peek(1);
				} while (top?.type === "flow-collection");
			} else if (fc.end.length === 0) {
				switch (this.type) {
					case "comma":
					case "explicit-key-ind":
						if (!it || it.sep) fc.items.push({ start: [this.sourceToken] });
						else it.start.push(this.sourceToken);
						return;
					case "map-value-ind":
						if (!it || it.value) fc.items.push({
							start: [],
							key: null,
							sep: [this.sourceToken]
						});
						else if (it.sep) it.sep.push(this.sourceToken);
						else Object.assign(it, {
							key: null,
							sep: [this.sourceToken]
						});
						return;
					case "space":
					case "comment":
					case "newline":
					case "anchor":
					case "tag":
						if (!it || it.value) fc.items.push({ start: [this.sourceToken] });
						else if (it.sep) it.sep.push(this.sourceToken);
						else it.start.push(this.sourceToken);
						return;
					case "alias":
					case "scalar":
					case "single-quoted-scalar":
					case "double-quoted-scalar": {
						const fs = this.flowScalar(this.type);
						if (!it || it.value) fc.items.push({
							start: [],
							key: fs,
							sep: []
						});
						else if (it.sep) this.stack.push(fs);
						else Object.assign(it, {
							key: fs,
							sep: []
						});
						return;
					}
					case "flow-map-end":
					case "flow-seq-end":
						fc.end.push(this.sourceToken);
						return;
				}
				const bv = this.startBlockValue(fc);
				/* istanbul ignore else should not happen */
				if (bv) this.stack.push(bv);
				else {
					yield* this.pop();
					yield* this.step();
				}
			} else {
				const parent = this.peek(2);
				if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
					yield* this.pop();
					yield* this.step();
				} else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
					const start = getFirstKeyStartProps(getPrevProps(parent));
					fixFlowSeqItems(fc);
					const sep = fc.end.splice(1, fc.end.length);
					sep.push(this.sourceToken);
					const map = {
						type: "block-map",
						offset: fc.offset,
						indent: fc.indent,
						items: [{
							start,
							key: fc,
							sep
						}]
					};
					this.onKeyLine = true;
					this.stack[this.stack.length - 1] = map;
				} else yield* this.lineEnd(fc);
			}
		}
		flowScalar(type) {
			if (this.onNewLine) {
				let nl = this.source.indexOf("\n") + 1;
				while (nl !== 0) {
					this.onNewLine(this.offset + nl);
					nl = this.source.indexOf("\n", nl) + 1;
				}
			}
			return {
				type,
				offset: this.offset,
				indent: this.indent,
				source: this.source
			};
		}
		startBlockValue(parent) {
			switch (this.type) {
				case "alias":
				case "scalar":
				case "single-quoted-scalar":
				case "double-quoted-scalar": return this.flowScalar(this.type);
				case "block-scalar-header": return {
					type: "block-scalar",
					offset: this.offset,
					indent: this.indent,
					props: [this.sourceToken],
					source: ""
				};
				case "flow-map-start":
				case "flow-seq-start": return {
					type: "flow-collection",
					offset: this.offset,
					indent: this.indent,
					start: this.sourceToken,
					items: [],
					end: []
				};
				case "seq-item-ind": return {
					type: "block-seq",
					offset: this.offset,
					indent: this.indent,
					items: [{ start: [this.sourceToken] }]
				};
				case "explicit-key-ind": {
					this.onKeyLine = true;
					const start = getFirstKeyStartProps(getPrevProps(parent));
					start.push(this.sourceToken);
					return {
						type: "block-map",
						offset: this.offset,
						indent: this.indent,
						items: [{
							start,
							explicitKey: true
						}]
					};
				}
				case "map-value-ind": {
					this.onKeyLine = true;
					const start = getFirstKeyStartProps(getPrevProps(parent));
					return {
						type: "block-map",
						offset: this.offset,
						indent: this.indent,
						items: [{
							start,
							key: null,
							sep: [this.sourceToken]
						}]
					};
				}
			}
			return null;
		}
		atIndentedComment(start, indent) {
			if (this.type !== "comment") return false;
			if (this.indent <= indent) return false;
			return start.every((st) => st.type === "newline" || st.type === "space");
		}
		*documentEnd(docEnd) {
			if (this.type !== "doc-mode") {
				if (docEnd.end) docEnd.end.push(this.sourceToken);
				else docEnd.end = [this.sourceToken];
				if (this.type === "newline") yield* this.pop();
			}
		}
		*lineEnd(token) {
			switch (this.type) {
				case "comma":
				case "doc-start":
				case "doc-end":
				case "flow-seq-end":
				case "flow-map-end":
				case "map-value-ind":
					yield* this.pop();
					yield* this.step();
					break;
				case "newline": this.onKeyLine = false;
				default:
					if (token.end) token.end.push(this.sourceToken);
					else token.end = [this.sourceToken];
					if (this.type === "newline") yield* this.pop();
			}
		}
	};
	exports.Parser = Parser;
}));
//#endregion
//#region ../../vscode/dshui_for_vscode/node_modules/yaml/dist/public-api.js
var require_public_api = /* @__PURE__ */ __commonJSMin(((exports) => {
	var composer = require_composer();
	var Document = require_Document();
	var errors = require_errors();
	var log = require_log();
	var identity = require_identity();
	var lineCounter = require_line_counter();
	var parser = require_parser();
	function parseOptions(options) {
		const prettyErrors = options.prettyErrors !== false;
		return {
			lineCounter: options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null,
			prettyErrors
		};
	}
	/**
	* Parse the input as a stream of YAML documents.
	*
	* Documents should be separated from each other by `...` or `---` marker lines.
	*
	* @returns If an empty `docs` array is returned, it will be of type
	*   EmptyStream and contain additional stream information. In
	*   TypeScript, you should use `'empty' in docs` as a type guard for it.
	*/
	function parseAllDocuments(source, options = {}) {
		const { lineCounter, prettyErrors } = parseOptions(options);
		const parser$1 = new parser.Parser(lineCounter?.addNewLine);
		const composer$1 = new composer.Composer(options);
		const docs = Array.from(composer$1.compose(parser$1.parse(source)));
		if (prettyErrors && lineCounter) for (const doc of docs) {
			doc.errors.forEach(errors.prettifyError(source, lineCounter));
			doc.warnings.forEach(errors.prettifyError(source, lineCounter));
		}
		if (docs.length > 0) return docs;
		return Object.assign([], { empty: true }, composer$1.streamInfo());
	}
	/** Parse an input string into a single YAML.Document */
	function parseDocument(source, options = {}) {
		const { lineCounter, prettyErrors } = parseOptions(options);
		const parser$1 = new parser.Parser(lineCounter?.addNewLine);
		const composer$1 = new composer.Composer(options);
		let doc = null;
		for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) if (!doc) doc = _doc;
		else if (doc.options.logLevel !== "silent") {
			doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
			break;
		}
		if (prettyErrors && lineCounter) {
			doc.errors.forEach(errors.prettifyError(source, lineCounter));
			doc.warnings.forEach(errors.prettifyError(source, lineCounter));
		}
		return doc;
	}
	function parse(src, reviver, options) {
		let _reviver = void 0;
		if (typeof reviver === "function") _reviver = reviver;
		else if (options === void 0 && reviver && typeof reviver === "object") options = reviver;
		const doc = parseDocument(src, options);
		if (!doc) return null;
		doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
		if (doc.errors.length > 0) {
			if (doc.options.logLevel !== "silent") throw doc.errors[0];
			else doc.errors = [];
		}
		return doc.toJS(Object.assign({ reviver: _reviver }, options));
	}
	function stringify(value, replacer, options) {
		let _replacer = null;
		if (typeof replacer === "function" || Array.isArray(replacer)) _replacer = replacer;
		else if (options === void 0 && replacer) options = replacer;
		if (typeof options === "string") options = options.length;
		if (typeof options === "number") {
			const indent = Math.round(options);
			options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
		}
		if (value === void 0) {
			const { keepUndefined } = options ?? replacer ?? {};
			if (!keepUndefined) return void 0;
		}
		if (identity.isDocument(value) && !_replacer) return value.toString(options);
		return new Document.Document(value, _replacer, options).toString(options);
	}
	exports.parse = parse;
	exports.parseAllDocuments = parseAllDocuments;
	exports.parseDocument = parseDocument;
	exports.stringify = stringify;
}));
//#endregion
//#region lib/types/host/legacy-migration.js
var import_dist = (/* @__PURE__ */ __commonJSMin(((exports) => {
	var composer = require_composer();
	var Document = require_Document();
	var Schema = require_Schema();
	var errors = require_errors();
	var Alias = require_Alias();
	var identity = require_identity();
	var Pair = require_Pair();
	var Scalar = require_Scalar();
	var YAMLMap = require_YAMLMap();
	var YAMLSeq = require_YAMLSeq();
	require_cst();
	var lexer = require_lexer();
	var lineCounter = require_line_counter();
	var parser = require_parser();
	var publicApi = require_public_api();
	var visit = require_visit();
	exports.Composer = composer.Composer;
	exports.Document = Document.Document;
	exports.Schema = Schema.Schema;
	exports.YAMLError = errors.YAMLError;
	exports.YAMLParseError = errors.YAMLParseError;
	exports.YAMLWarning = errors.YAMLWarning;
	exports.Alias = Alias.Alias;
	exports.isAlias = identity.isAlias;
	exports.isCollection = identity.isCollection;
	exports.isDocument = identity.isDocument;
	exports.isMap = identity.isMap;
	exports.isNode = identity.isNode;
	exports.isPair = identity.isPair;
	exports.isScalar = identity.isScalar;
	exports.isSeq = identity.isSeq;
	exports.Pair = Pair.Pair;
	exports.Scalar = Scalar.Scalar;
	exports.YAMLMap = YAMLMap.YAMLMap;
	exports.YAMLSeq = YAMLSeq.YAMLSeq;
	exports.Lexer = lexer.Lexer;
	exports.LineCounter = lineCounter.LineCounter;
	exports.Parser = parser.Parser;
	exports.parse = publicApi.parse;
	exports.parseAllDocuments = publicApi.parseAllDocuments;
	exports.parseDocument = publicApi.parseDocument;
	exports.stringify = publicApi.stringify;
	exports.visit = visit.visit;
	exports.visitAsync = visit.visitAsync;
})))();
const EMPTY_DOCUMENT = {
	global: {},
	projects: {},
	sessions: {}
};
function mergeLegacyOverrides(current, legacy, completed = false) {
	if (completed) return current;
	const imported = documentOf(legacy) ?? EMPTY_DOCUMENT;
	return {
		global: {
			...imported.global,
			...current.global
		},
		projects: mergeBuckets(imported.projects, current.projects),
		sessions: mergeBuckets(imported.sessions, current.sessions)
	};
}
function readLegacyOverridesSyncResult() {
	let source;
	try {
		source = readFileSync(dshHomePath("settings.yaml.imported"), "utf8");
	} catch (error) {
		return error.code === "ENOENT" ? { status: "unavailable" } : { status: "invalid" };
	}
	return parseLegacyOverridesResult(source);
}
async function readLegacyOverrides() {
	let source;
	try {
		source = await readFile(dshHomePath("settings.yaml.imported"), "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return void 0;
		throw error;
	}
	return parseLegacyOverrides(source);
}
function parseLegacyOverridesResult(source) {
	let parsed;
	try {
		parsed = (0, import_dist.parse)(source);
	} catch {
		return { status: "invalid" };
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { status: "invalid" };
	const legacy = parsed["capability-toggle"];
	if (legacy === void 0) return { status: "unavailable" };
	if (legacy === null || typeof legacy !== "object" || Array.isArray(legacy)) return { status: "invalid" };
	const document = documentOf(legacy);
	return document === void 0 ? { status: "invalid" } : {
		status: "available",
		value: document
	};
}
function parseLegacyOverrides(source) {
	const result = parseLegacyOverridesResult(source);
	return result.status === "available" ? result.value : void 0;
}
function documentOf(value) {
	const record = value;
	const global = record.global === void 0 ? {} : overrideMapOf(record.global);
	const projects = record.projects === void 0 ? {} : mapOfMaps(record.projects);
	const sessions = record.sessions === void 0 ? {} : mapOfMaps(record.sessions);
	if (global === void 0 || projects === void 0 || sessions === void 0) return void 0;
	return {
		global,
		projects,
		sessions
	};
}
function mergeBuckets(legacy, current) {
	const result = { ...legacy };
	for (const [key, overrides] of Object.entries(current)) result[key] = {
		...legacy[key] ?? {},
		...overrides
	};
	return result;
}
function mapOfMaps(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
	const result = {};
	for (const [key, map] of Object.entries(value)) {
		const parsed = overrideMapOf(map);
		if (parsed !== void 0 && Object.keys(parsed).length > 0) result[key] = parsed;
	}
	return result;
}
function overrideMapOf(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
	const entries = Object.entries(value);
	const result = {};
	for (const [key, state] of entries) if (state === "on" || state === "off") result[key] = state;
	return entries.length > 0 && Object.keys(result).length === 0 ? void 0 : result;
}
//#endregion
//#region lib/types/shared/resolve.js
/**
* Pure resolution of layered capability overrides into an effective decision.
* Shared by the Host (which applies the decision to the tool/skill seams) and
* the browser panel (which shows the resolved fallback per row). No runtime
* dependency on either half.
*
* @module dsh-capability-toggle-plugin/shared/resolve
*/
/**
* Priority order applied on read: the first level with an explicit stance wins.
* This is also the display and write order, so it is the single source of truth
* the store (`WRITABLE_LEVELS`) and the panel (`levelsVisible`) both import — no
* level list is spelled out a second time.
*/
const LEVEL_PRIORITY = [
	"session",
	"project",
	"global"
];
const CALLABLE_KINDS = [
	"skill",
	"mcp",
	"tool"
];
/**
* Read one capability's stance at one level. A stored map omits `inherit`, so a
* missing key resolves to `inherit`.
* @param map - one level's override map.
* @param id - capability switch key.
* @returns the stored stance, or `inherit` when the level is silent.
*/
function stanceAt(map, id) {
	if (!Object.prototype.hasOwnProperty.call(map, id)) return "inherit";
	return map[id] ?? "inherit";
}
/**
* Resolve the effective stance for one capability across all levels. Session
* beats project beats global; a level that is `inherit` (or silent) falls
* through. When every level is silent the `fallback` decides — `on` for the
* capability families that are enabled by default (skill/mcp/tool/prompt/
* approval), `off` for the opt-in `guard` family that starts inactive.
* @param overrides - the three level maps.
* @param id - capability switch key.
* @param fallback - the stance when every level is silent (default `on`).
* @returns the winning explicit stance, or `fallback` when none is set.
*/
function resolveStance(overrides, id, fallback = "on") {
	for (const level of LEVEL_PRIORITY) {
		const stance = stanceAt(overrides[level] ?? {}, id);
		if (stance !== "inherit") return stance;
	}
	return fallback;
}
/**
* Whether one capability of a DEFAULT-ON family resolves to disabled. Uses the
* `on` fallback, so a silent capability is enabled and only an explicit merged
* `off` disables it. Not for `guard` rows — those default off; use
* {@link isGuardActive}.
* @param overrides - the three level maps.
* @param id - capability switch key.
* @returns `true` when the merged decision is `off`.
*/
function isDisabled(overrides, id) {
	return resolveStance(overrides, id, "on") === "off";
}
/**
* Whether one `guard` preset resolves to ACTIVE. Uses the `off` fallback, so a
* silent guard is inactive and only an explicit merged `on` activates it — the
* opt-in direction that keeps freshly-installed guards from tightening every
* agent until a user turns one on.
* @param overrides - the three level maps.
* @param id - guard switch key.
* @returns `true` when the merged decision is `on`.
*/
function isGuardActive(overrides, id) {
	return resolveStance(overrides, id, "off") === "on";
}
/**
* Resolve one MCP member tool's effective stance. MCP tools are the second
* OPT-IN family (after `guard`): a member resolves from the FIRST level that
* says something, where its OWN stance at that level beats its server group's,
* and a level silent for both falls through. When every level is silent for
* both, the answer is `off` — the plugin's "every MCP tool starts disabled,
* enable what you need" default.
*
* The group's stance is therefore a DEFAULT for its members, not an override of
* them: `mcp:<server>` ON enables every member that has not been set OFF at the
* same or a nearer level (one gesture for a whole server), and a member's own
* `on` at a level beats a group `off` at the SAME level — the more specific
* statement wins. To keep a whole server silent, leave the members unset here or
* clear them, rather than relying on the group alone.
* @param overrides - the three level maps.
* @param memberId - the member's `mcptool:<server>/<rest>` switch key.
* @param groupId - the server's `mcp:<server>` switch key.
* @returns the winning explicit stance, or `off` when nothing is set.
*/
function mcpMemberStance(overrides, memberId, groupId) {
	for (const level of LEVEL_PRIORITY) {
		const map = overrides[level] ?? {};
		const own = stanceAt(map, memberId);
		if (own !== "inherit") return own;
		const group = stanceAt(map, groupId);
		if (group !== "inherit") return group;
	}
	return "off";
}
/**
* Whether one MCP member tool resolves to disabled. `true` unless the member —
* or its server group at a level the member leaves silent — says `on`, since an
* MCP tool defaults to off.
* @param overrides - the three level maps.
* @param memberId - the member's switch key.
* @param groupId - the server's switch key.
* @returns `true` when the tool is denied.
*/
function isMcpMemberDisabled(overrides, memberId, groupId) {
	return mcpMemberStance(overrides, memberId, groupId) === "off";
}
/**
* The complete set of switch ids that resolve to disabled across one INVENTORY:
* the id universe an agent's enforcement is applied against. Unlike
* {@link disabledIds} (a flat default-on evaluation over a list of ids), this
* walks the descriptor tree so the two families whose default is not "enabled"
* are read against their own rule:
*
*   - `mcp`: a member tool resolves through {@link isMcpMemberDisabled}
*     (member stances, then its server group's, then the opt-in `off` default),
*     so its MEMBER id — not the group id — is what the tools seam denies. The
*     group id is additionally reported when NOT ONE member is enabled, which is
*     the group row's "this whole server is off" reading; the tools seam ignores
*     it (see `deniedToolNames`).
*   - every other family (skill/tool/prompt/approval/guard): the flat
*     default-on {@link isDisabled} read, unchanged. A `guard` id listed here
*     is inert for the tool/skill seams; guards are enforced by their own
*     pre-execute listener (see `AgentBinding.installGuards`).
* @param descriptors - the inventory to resolve against.
* @param overrides - the three level maps.
* @returns the disabled switch ids, in inventory order.
*/
function disabledIdsForInventory(descriptors, overrides) {
	const out = [];
	for (const d of descriptors) {
		if (d.kind === "mcp") {
			const members = d.memberTools ?? [];
			let anyEnabled = false;
			for (const m of members) if (isMcpMemberDisabled(overrides, m.id, d.id)) out.push(m.id);
			else anyEnabled = true;
			if (!anyEnabled) out.push(d.id);
			continue;
		}
		if (isDisabled(overrides, d.id)) out.push(d.id);
	}
	return out;
}
/**
* Build the UI projection from an inventory and the layered overrides — the
* pure core of the per-row transform. Shared by the live-agent binding (which
* passes its per-agent guard-hit tally) and the no-live-agent fallback read
* (which has no running tally, so guard rows report zero hits). Keeping this a
* pure function is what lets the panel show persisted state even when no agent
* is currently bound: the effect a row reports is `store.layered()` resolved
* against a known inventory, independent of whether enforcement is applied
* right now.
*
* Three default directions ride this one transform, each read against its own
* family default:
*   - `guard` is opt-in: its resolved effect is ACTIVE (`isGuardActive`, off
*     fallback) and it carries a hit count.
*   - an `mcp` group row carries its member tools as RESOLVED member rows, each
*     opt-in too (`isMcpMemberDisabled`: `off` unless the member or its server
*     says `on`). The group's own effect is "not one member is callable", so the
*     server row dims exactly when it offers the model nothing.
*   - every other family is default-on: its effect is DISABLED (`isDisabled`,
*     on fallback).
* The two counters pair up by family: `hitCount` answers "did this safety rule
* fire?" and rides only guard rows, while `callCount` answers "how much did the
* model actually use this?" and rides only the callable families
* ({@link CALLABLE_KINDS}) — `prompt` and `approval` rows are assembled or
* consulted rather than called, so they carry neither. Both flags are always
* present on the wire; only the one matching the kind is meaningful.
*
* @param descriptors - the full (pristine) capability inventory to render.
* @param overrides - the three level maps resolved for this scope.
* @param projectKey - the project root the project level binds to (`''` none).
* @param guardHits - optional per-guard hit tally; absent → 0 for every guard.
* @param callHits - optional per-capability call tally; absent → 0 for every
*   callable row, the value an idle (no live agent) read reports.
* @returns the projection the composer panel renders.
*/
function buildProjection(descriptors, overrides, projectKey, guardHits, callHits) {
	return {
		rows: descriptors.map((d) => {
			const levels = {
				session: stanceAt(overrides.session, d.id),
				project: stanceAt(overrides.project, d.id),
				global: stanceAt(overrides.global, d.id)
			};
			const { memberTools, ...base } = d;
			if (d.kind === "guard") return {
				...base,
				levels,
				disabled: isGuardActive(overrides, d.id),
				hitCount: guardHits?.get(d.id) ?? 0
			};
			if (d.kind === "mcp") {
				const members = (memberTools ?? []).map((m) => ({
					...m,
					levels: {
						session: stanceAt(overrides.session, m.id),
						project: stanceAt(overrides.project, m.id),
						global: stanceAt(overrides.global, m.id)
					},
					disabled: isMcpMemberDisabled(overrides, m.id, d.id),
					callCount: callHits?.get(m.id) ?? 0
				}));
				const callCount = members.length > 0 ? members.reduce((sum, m) => sum + (m.callCount ?? 0), 0) : callHits?.get(d.id) ?? 0;
				return {
					...base,
					levels,
					memberTools: members,
					callCount,
					disabled: !members.some((m) => !m.disabled)
				};
			}
			if (CALLABLE_KINDS.includes(d.kind)) return {
				...base,
				levels,
				disabled: isDisabled(overrides, d.id),
				callCount: callHits?.get(d.id) ?? 0
			};
			return {
				...base,
				levels,
				disabled: isDisabled(overrides, d.id)
			};
		}),
		projectKey
	};
}
//#endregion
//#region lib/types/host/store.js
var OverrideStore = class {
	ctx;
	config;
	legacy;
	constructor(ctx, config, legacy) {
		this.ctx = ctx;
		this.config = config;
		this.legacy = legacy;
	}
	read() {
		const current = {
			global: this.config.global.get() ?? {},
			projects: this.config.projects.get() ?? {},
			sessions: this.config.sessions.get() ?? {}
		};
		return this.legacy === void 0 || this.config.legacyMigrationCompleted.get() === true ? current : mergeLegacyOverrides(current, this.legacy);
	}
	layered(projectKey, sessionKey) {
		const doc = this.read();
		return {
			session: doc.sessions[sessionKey] ?? {},
			project: projectKey === "" ? {} : doc.projects[projectKey] ?? {},
			global: doc.global
		};
	}
	async migrateLegacy(source) {
		if (this.config.legacyMigrationCompleted.get() === true) return false;
		const legacy = source ?? this.legacy ?? await readLegacyOverrides();
		if (legacy === void 0) return false;
		let migrated = false;
		await this.ctx.configEditor.edit(this.entry(), (current) => {
			const existing = configOf(current);
			if (existing.legacyMigrationCompleted) return rawOf(existing);
			const next = mergeLegacyOverrides(existing, legacy);
			migrated = true;
			return rawOf({
				...next,
				legacyMigrationCompleted: true
			});
		});
		return migrated;
	}
	async set(selector, id, state) {
		await this.persist(selector, (map) => writeMap(map, id, state));
	}
	async setMany(selector, ids, state) {
		if (ids.length === 0) return;
		await this.persist(selector, (map) => {
			let next = map;
			for (const id of ids) next = writeMap(next, id, state);
			return next;
		});
	}
	entry() {
		const entry = this.ctx.configEditor.entries().find((row) => row.options.id === "dsh-capability-toggle-plugin");
		if (entry === void 0) throw new Error("capability-toggle configuration entry is unavailable");
		return entry;
	}
	async persist(selector, transform) {
		await this.ctx.configEditor.edit(this.entry(), (current) => {
			const existing = configOf(current);
			return rawOf(nextDocument(existing.legacyMigrationCompleted || this.legacy === void 0 ? existing : {
				...mergeLegacyOverrides(existing, this.legacy),
				legacyMigrationCompleted: true
			}, selector, transform));
		});
	}
};
function configOf(current) {
	const doc = current;
	return {
		global: doc.global ?? {},
		projects: doc.projects ?? {},
		sessions: doc.sessions ?? {},
		legacyMigrationCompleted: doc.legacyMigrationCompleted === true
	};
}
function rawOf(document) {
	return {
		global: document.global,
		projects: document.projects,
		sessions: document.sessions,
		legacyMigrationCompleted: document.legacyMigrationCompleted
	};
}
function nextDocument(doc, selector, transform) {
	if (selector.level === "global") return {
		...doc,
		global: transform(doc.global)
	};
	const bucket = selector.level === "project" ? doc.projects : doc.sessions;
	const nextMap = transform(bucket[selector.key] ?? {});
	const nextBucket = { ...bucket };
	if (Object.keys(nextMap).length === 0) delete nextBucket[selector.key];
	else nextBucket[selector.key] = nextMap;
	const field = selector.level === "project" ? "projects" : "sessions";
	return {
		...doc,
		[field]: nextBucket
	};
}
function writeMap(map, id, state) {
	const next = { ...map };
	if (state === "inherit") delete next[id];
	else next[id] = state;
	return next;
}
const WRITABLE_LEVELS = LEVEL_PRIORITY;
//#endregion
//#region lib/types/host/prompt.js
/**
* Prompt-context capability family: switchable system-prompt contributions
* beyond tools and skills.
*
* Unlike tools/skills — enumerated live from their registries — the promptable
* surface is a CURATED ALLOWLIST. The `dsh-system-prompt` registry exposes many
* sections/contexts, but only a few are SAFE to gate per scope:
*
*   - `deployment:persona`   — the order-0 persona; empty text is a documented
*                              first-class state, so shadowing it is safe.
*   - `sandbox:policy`       — runtime-context telling the model the sandbox
*   - `approval:policy`        mode / approval policy. Gating only changes what
*                              the model is TOLD, never what is ENFORCED (the
*                              owning services keep running).
*   - a coarse "hide all runtime context" switch backed by
*     `suppressRuntimeContext()`.
*
* Deliberately EXCLUDED (would break the model or the render):
*   - `harness:identity`            — the model's framework grounding.
*   - `tools:code-only`/`tools:sdk` — protocol-critical in code-presentation.
*   - `provider`/`model`/`cwd`      — strict-interpolated variables; shadowing
*                                     one to empty throws at render.
*
* Every gate is the SAME mechanism tools/skills use: register a same-name entry
* in the agent's scope. A scoped same-name section/context shadows the global
* one (nearest-scope-wins in the assembly merge) and, being empty, is dropped
* at render — so the model no longer reads it, while the owning service is
* untouched. All registrations are Cordis effects (return a disposer).
*
* Presence is PROBED, not assumed: `assemble({ scope })` reports which section
* and context names are actually active for this scope, so a deployment that
* never registered `sandbox:policy` simply shows no switch for it.
*
* @module dsh-capability-toggle-plugin/host/prompt
*/
/** Prefix for a prompt-section gate switch id: `prompt:section:<name>`. */
const SECTION_PREFIX = "prompt:section:";
/** Prefix for a prompt-context gate switch id: `prompt:context:<name>`. */
const CONTEXT_PREFIX = "prompt:context:";
/**
* The single coarse runtime-context suppressor switch id. Unlike the other
* prompt ids (`prompt:section:<name>` / `prompt:context:<name>`, 3 segments,
* each targeting one named registry entry), this is an intentionally bare
* 2-segment singleton: it shadows no specific name, it toggles the all-or-
* nothing `suppressRuntimeContext()` seam, so there is no `<name>` to carry.
*/
const RUNTIME_SUPPRESS_ID = "prompt:runtime";
/**
* Curated allowlist of safe-to-gate SECTIONS. Orders mirror the framework's own
* registrations so the shadow lands at the same ordinal (irrelevant once empty,
* but keeps the intent legible).
*/
const SECTION_GATES = [{
	registryName: "deployment:persona",
	order: 0,
	key: "persona"
}];
/**
* Curated allowlist of safe-to-gate CONTEXTS (runtime-context snapshots). These
* only change what the model is told; the sandbox/approval services still run.
*/
const CONTEXT_GATES = [{
	registryName: "sandbox:policy",
	order: 100,
	key: "sandbox"
}, {
	registryName: "approval:policy",
	order: 200,
	key: "approval"
}];
/** Build the `prompt:section:<name>` switch id. */
function sectionId(registryName) {
	return `${SECTION_PREFIX}${registryName}`;
}
/** Build the `prompt:context:<name>` switch id. */
function contextId(registryName) {
	return `${CONTEXT_PREFIX}${registryName}`;
}
/**
* Enumerate the promptable capabilities that ACTUALLY exist for one scope.
*
* Probes the live assembly for this scope and keeps only allowlisted names that
* are present, plus the always-available coarse runtime suppressor. Pure read:
* `assemble` registers nothing. Returns `[]` when there is no scope (a global
* shadow would collide with the framework's own same-name registration) or when
* `systemPrompt` is unavailable.
*
* @param ctx - a context that can read `systemPrompt` (the scoped ctx).
* @param scope - the agent scope key; undefined disables prompt gating.
* @returns descriptors carrying the i18n key in `name` (the UI resolves it).
*/
async function collectPromptGates(ctx, scope) {
	if (scope === void 0) return [];
	const system = ctx.get("systemPrompt");
	if (system === void 0) return [];
	const assembly = await system.assemble({ scope });
	const sectionNames = new Set(assembly.sections.map((s) => s.name));
	const contextNames = new Set(assembly.contexts.map((c) => c.name));
	const rows = [];
	for (const gate of SECTION_GATES) if (sectionNames.has(gate.registryName)) rows.push({
		id: sectionId(gate.registryName),
		name: gate.key,
		description: gate.registryName,
		kind: "prompt"
	});
	for (const gate of CONTEXT_GATES) if (contextNames.has(gate.registryName)) rows.push({
		id: contextId(gate.registryName),
		name: gate.key,
		description: gate.registryName,
		kind: "prompt"
	});
	rows.push({
		id: RUNTIME_SUPPRESS_ID,
		name: "runtime",
		description: "",
		kind: "prompt"
	});
	return rows;
}
/**
* Try one best-effort shadow registration. `dsh-system-prompt` throws when a
* same-name section or context is already registered in this exact scope layer
* (a per-agent composition can hold the name first, e.g. dsh-tool-subagent's
* `tool:subagent` guidance). A cosmetic shadow must never abort the rest of
* reconcile — the gates installed after the sweep would be silently skipped —
* so report the skipped shadow through the drift sink and return undefined.
*
* @param register - performs the registration and returns its disposer.
* @param onDrift - optional warn-once sink for the skipped-shadow report.
* @param what - human label naming the shadow for the report.
* @returns the disposer on success, or undefined when registration threw.
*/
function attemptShadow(register, onDrift, what) {
	try {
		return register();
	} catch (error) {
		onDrift?.("prompt.shadow.register", `capability-toggle: shadow for ${what} could not be registered: ${error instanceof Error ? error.message : String(error)}`);
		return;
	}
}
/**
* Apply prompt-gate enforcement for one scope: for every disabled prompt switch,
* register the matching empty shadow (section/context) or the runtime
* suppressor. Each returns a Cordis disposer, collected by the caller.
*
* MUST be called on a SCOPED context (never the host root): a same-name section
* or context in the global layer collides with the framework's own registration
* and throws. The caller gates on `scope !== undefined` before invoking.
*
* COLLISION-TOLERANT: a same-name entry already registered in this exact scope
* layer makes one registration throw; the collision is reported through
* `onDrift` and skipped so the remaining gates still apply.
*
* @param scopedCtx - the agent's scoped context.
* @param descriptors - this scope's promptable inventory.
* @param disabledIds - switch ids resolved to disabled.
* @param onDrift - optional warn-once sink for skipped shadows.
* @returns disposers for every shadow/suppressor successfully installed.
*/
function applyPromptGates(scopedCtx, descriptors, disabledIds, onDrift) {
	const disposers = [];
	const system = scopedCtx.get("systemPrompt");
	if (system === void 0) return disposers;
	for (const d of descriptors) {
		if (d.kind !== "prompt" || !disabledIds.has(d.id)) continue;
		if (d.id === "prompt:runtime") {
			disposers.push(system.suppressRuntimeContext());
			continue;
		}
		if (d.id.startsWith(SECTION_PREFIX)) {
			const registryName = d.id.slice(15);
			const spec = SECTION_GATES.find((g) => g.registryName === registryName);
			const dispose = attemptShadow(() => system.section({
				name: registryName,
				order: spec?.order ?? 0,
				text: ""
			}), onDrift, `prompt section "${registryName}"`);
			if (dispose !== void 0) disposers.push(dispose);
			continue;
		}
		if (d.id.startsWith(CONTEXT_PREFIX)) {
			const registryName = d.id.slice(15);
			const spec = CONTEXT_GATES.find((g) => g.registryName === registryName);
			const dispose = attemptShadow(() => system.context({
				name: registryName,
				order: spec?.order ?? 100,
				text: ""
			}), onDrift, `prompt context "${registryName}"`);
			if (dispose !== void 0) disposers.push(dispose);
		}
	}
	return disposers;
}
//#endregion
//#region lib/types/host/approval.js
/**
* Approval-policy capability family: a single switch that locks one agent's
* approval requests to a deterministic rejection, without touching the
* deployment's shared approval-policy state.
*
* WHY A DEDICATED SEAM (not `approval.setPolicy`):
* DSH already ships a first-class permission UI (`dsh-permission-presets` +
* `dsh-client-ui-permission-presets`: the `/permission` command, the composer
* chip, the Settings row) that OWNS the session's approval policy. It writes a
* durable `approval/policy` session-log event AND injects a model message
* ("the approval policy changed…"). `ApprovalService.setPolicy` does the same.
* If this plugin also called `setPolicy`, its reconcile would repeatedly
* overwrite the user's `/permission` choice on the ONE shared policy value —
* two controllers fighting over one piece of log-folded state, last-write-wins.
*
* Instead we gate the SAME seam the policy consults, one layer earlier and
* scoped to this agent only: `approval/request` is a `Scoped<ApprovalService>`
* waterfall. A scope-tagged listener (registered through the agent's scoped
* context) receives ONLY that agent's requests. When the switch is off we claim
* the request with `'rejected'`; when on we `next()` to delegate to whatever
* the deployment composed (the real answerers, or the policy's own decision).
*
* Properties this buys us:
*   - Clean disposer, exactly like `tools.restrict`: reconcile installs the
*     listener when disabled and disposes it when re-enabled — no state to
*     unwind, no log event, no injected message.
*   - No collision with `dsh-permission-presets`: we never write
*     `approval/policy`; the user's `/permission` value is read-through
*     untouched by our `next()`.
*   - Scope-isolated: only the bound agent is affected. A same-name listener on
*     the GLOBAL layer (no scope) would intercept EVERY agent, so enforcement
*     is gated on a real scope, exactly like the prompt shadows.
*
* SEMANTICS (direction matches the other switches — off = tighten/lock):
*   - on / inherit  → normal: delegate via `next()` (answerers or session policy).
*   - off           → locked: every approval request for this agent resolves
*                     `'rejected'` (no interactive escalation, no sandbox
*                     elevation). The model still sees a normal rejected tool
*                     result — the audit pair the service always logs remains
*                     the record of the decision.
*
* OPTIONAL SERVICE: not every deployment loads `dsh-user-approval`, so the
* `approval` service is NOT in the plugin's `inject` list (that would block the
* whole plugin from loading where approval is absent). Presence is probed with
* `ctx.get('approval', false)`; when absent, no row is offered and no listener
* is registered — the family simply does not exist for that deployment.
*
* @module dsh-capability-toggle-plugin/host/approval
*/
/**
* The sole approval-family switch id. Like `prompt:runtime` it is an
* intentionally bare singleton: it gates one all-or-nothing behavior (lock this
* agent's approvals), so it carries no `<name>` segment. The `:policy` suffix
* reads as "the approval policy gate" and keeps it clear of the `approval/…`
* event namespace.
*/
const APPROVAL_GATE_ID = "approval:policy";
/**
* Whether the deployment loaded the approval service. Non-strict `get` returns
* undefined instead of throwing when the service is absent, so this is a safe
* presence probe from a context that does not inject `approval`.
* @param ctx - any context.
* @returns true when `ctx.approval` is resolvable.
*/
function approvalAvailable(ctx) {
	return ctx.get("approval", false) !== void 0;
}
/**
* The approval-family inventory: one row when the approval service is present,
* none otherwise. Pure read — registers nothing.
* @param ctx - a context whose service presence reflects the deployment.
* @returns a single-element array, or an empty array when approval is absent.
*/
function collectApprovalGate(ctx) {
	if (!approvalAvailable(ctx)) return [];
	return [{
		id: APPROVAL_GATE_ID,
		name: "policy",
		description: "Allow approval escalation for this agent. When off, every approval request is auto-rejected (no interactive prompt, no sandbox elevation).",
		kind: "approval"
	}];
}
/**
* Install the approval lock on a scoped context when the gate is disabled.
*
* Registration MUST go through a context carrying the agent's scope tag so the
* `approval/request` listener is filtered to this agent only. The caller (the
* agent binding) guarantees this by passing its `scopedCtx`, and by only
* calling this when the agent has a real scope — a listener registered on the
* global layer would intercept every agent's approvals.
*
* @param scopedCtx - the agent-scoped context (its scope tag filters dispatch).
* @param disabled - the switch ids resolved to disabled for this agent.
* @returns a disposer array: one entry that removes the listener when the gate
*   is disabled, empty when it is on (nothing installed).
*/
function applyApprovalGate(scopedCtx, disabled) {
	if (!disabled.has("approval:policy")) return [];
	if (!approvalAvailable(scopedCtx)) return [];
	return [scopedCtx.on("approval/request", () => Promise.resolve("rejected"), { prepend: true })];
}
//#endregion
//#region lib/types/host/guards.js
/**
* Guard presets: opt-in safety rules enforced at the `tools/pre-execute` seam.
*
* Unlike the skill/tool/mcp/approval families (which switch a whole capability
* on or off), a guard inspects the ARGUMENTS of a pending call and decides per
* call. This is the only seam that can express "bash is allowed, but not
* `rm -rf`" or "writing is fine, but not to `.env`". `tools/pre-execute` is a
* `Scoped<ToolRuntime>` waterfall returning a `PreToolDecision`:
*   - `allow`        → run the call (our `next()`, i.e. no matching guard).
*   - `deny{reason}` → materialize an error the model reads as a normal tool
*                      failure carrying `reason`.
*   - `ask{reason?}` → defer to the approval service: the call runs only on
*                      `allowed-once`, otherwise denies (fail closed). This is
*                      the pre-execute seam's NATIVE bridge to the same approval
*                      waterfall the `approval` family gates — a dangerous call
*                      becomes a human confirmation instead of a hard failure.
*
* OPT-IN, so the resolved default is OFF (see the `guard`-family fallback in
* shared/resolve.ts): a freshly loaded plugin perturbs no agent until a user
* turns a preset ON. Turning one ON tightens — direction uniform with the other
* switches; only the default differs.
*
* SCOPE + ORDER: registration MUST go through the agent's scoped context. The
* scope routing key for `tools/pre-execute` is `exec.agent`, so a scope-tagged
* listener receives ONLY this agent's calls; a listener on the global layer
* would gate EVERY agent (the caller gates on a real scope, exactly like the
* approval seam and the prompt shadows). We register with `prepend: true` so a
* decisive `deny`/`ask` is returned before any later-registered pre-execute
* listener runs — the same ordering discipline the shipped `dsh-tool-jobs`
* pre-execute listener uses.
*
* MATCHING IS A PURE FUNCTION (`evaluateGuards`): name + parsed arguments in, a
* decision or null out. No `ctx`, no live agent — the whole matching core is
* unit-tested directly. The listener is a thin scoped wrapper that counts hits
* and returns the decision.
*
* @module dsh-capability-toggle-plugin/host/guards
*/
/** The `guard:<name>` id namespace, disjoint from skill/mcp/tool/prompt/approval. */
function guardId(name) {
	return `guard:${name}`;
}
/** Coerce one argument field to a string; anything non-string reads as `''`. */
function argStr(args, key) {
	const v = args[key];
	return typeof v === "string" ? v : "";
}
const SHELL_TOOLS = /* @__PURE__ */ new Set(["bash", "pwsh"]);
const STR_REPLACE_EDITOR = "str_replace_editor";
/** The file-mutating tool names, denied wholesale by the read-only preset. */
const FILE_WRITE_TOOLS = /* @__PURE__ */ new Set(["write", "edit"]);
const EDITOR_READ_COMMANDS = /* @__PURE__ */ new Set(["view"]);
/**
* Common file-mutating SHELL invocations the read-only preset also blocks, so a
* shell call cannot trivially route around the native file-write tools with
* `sed -i` / `tee` / `dd of=`. This is a HIGH-PRECISION subset, deliberately not
* exhaustive: it targets the three canonical in-place writers with near-zero
* false positives (`tee`, `sed -i`, `dd … of=`) and intentionally does NOT try
* to catch shell redirection (`>`, `>>`) — redirection's false-positive surface
* (`2>&1`, `>/dev/null`, a `>` inside a quoted string) is too wide to deny on,
* and readonly is defense-in-depth, not a sealed sandbox (see the preset
* description). A determined `python -c "open(...,'w')"`, a heredoc, or an MCP
* write tool is out of scope by design.
*/
const READONLY_SHELL_WRITE = /\btee\b|\bsed\s+-i|\bdd\b[^\n]{0,2000}?\bof=/;
const PS_READONLY_WRITE = new RegExp(String.raw`(?:^|[;|&({=\r\n])[ \t]*(?:&[ \t]*)?\$?\(?[ \t]*["']?[ \t]*(?:Set-Content|Add-Content|Clear-Content|Out-File|New-Item|Export-Csv)\b` + String.raw`|(?:^|[;|&({=\r\n])[ \t]*(?:ni|clc|epcsv)\b`, "i");
/** Tool names that reach the network directly (not via a shell). */
const NETWORK_TOOLS = /* @__PURE__ */ new Set(["web_search", "web_fetch"]);
/**
* Dangerous shell fragments: recursive/forced rm, raw disk writes, mkfs, world
* writable chmod, piping a download straight into a shell, a fork bomb, or
* clobbering a block device.
*/
const SHELL_GAP = String.raw`[^;|&]{0,8000}?`;
const SHELL_REST = String.raw`[^\n|&;]{0,8000}?`;
const PS_GAP = String.raw`(?:[^\n;|` + "`" + String.raw`]|` + "`" + String.raw`\r?\n){0,8000}?`;
const PS_DELETE_TAIL = String.raw`-(?:R(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?|Fo(?:r(?:c(?:e)?)?)?)\b`;
const DANGEROUS_SHELL = new RegExp(String.raw`(?<![-\w])\brm\b${SHELL_GAP}(?:--(?:recursive|force)\b|-\w*[rRfF]\w*\b)` + String.raw`|\bdd\b${SHELL_GAP}\b(?:if|of)=` + String.raw`|\bmkfs\b|\bmke2fs\b|\bshred\b` + String.raw`|\bchmod\s+(?:-R\s+)?(?:0?777\b|ugo\+rwx\b|a\+rwx\b)` + String.raw`|\|\s*(?:sudo\s+)?(?:\S{0,200}\/)?(?:sh|bash)\b` + String.raw`|\|\s*(?:sudo\s+)?\S{0,200}\/env\s+bash\b` + String.raw`|:\s*\(\s*\)\s*\{\s*:\s*\|\s*:` + String.raw`|>\s*\/dev\/(sd|nvme|disk)|\btee\s+\/dev\/(sd|nvme|disk)`);
const PS_DANGEROUS = new RegExp(String.raw`\b(?:Format-Volume|Clear-Disk|Stop-Computer|Restart-Computer)\b` + String.raw`|\bRemove-Item\b${PS_GAP}${PS_DELETE_TAIL}` + String.raw`|(?:^|[;|&({=\r\n])[ \t]*(?:rm|del|ri|rmdir|erase|rd)\b${PS_GAP}${PS_DELETE_TAIL}`, "i");
const SHELL_ARGUMENT = String.raw`(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s;|&"']{1,500})`;
const PS_ENCODED = new RegExp(String.raw`\b(?:pwsh|powershell)(?:\.exe)?(?:[ \t]+-(?:(?:ExecutionPolicy|ep|WindowStyle|w|InputFormat|if|OutputFormat|of)[ \t]+(?![ \t]*-)${SHELL_ARGUMENT}|[a-z]\w*))*[ \t]+-e(?:n(?:c(?:o(?:d(?:e(?:d(?:command)?)?)?)?)?)?)?\b`, "i");
const GIT_SEP = String.raw`\s+`;
const GIT_PREFIX = String.raw`\bgit(?:${GIT_SEP}(?:(?:-[Cc]|--(?:git-dir|work-tree|namespace|config-env))${GIT_SEP}${SHELL_ARGUMENT}|--[^\s;|&"']{0,200}(?:="[^"\r\n]{0,300}"|='[^'\r\n]{0,300}')?)){0,50}?${GIT_SEP}`;
const DESTRUCTIVE_GIT = new RegExp(String.raw`${GIT_PREFIX}(?:push\b${SHELL_REST}(?:--force\b|--force-with-lease\b|--mirror\b|--delete\b|-f\b)|reset\b${SHELL_REST}--hard\b|clean\s+-\w{0,10}f|branch\s+-D\b)`);
/** Outbound-network shell fragments. */
const NETWORK_CMD = new RegExp(String.raw`\b(curl|wget)\b|${GIT_PREFIX}push\b|\bnpm\b[^\n;|&]{0,500}\bpublish\b|\bscp\b`);
const PS_NETWORK = /\b(?:Invoke-WebRequest|Invoke-RestMethod|Start-BitsTransfer|iwr|irm)\b/i;
/**
* Secret-bearing path fragments: dotenv files, private keys, credential stores,
* cloud/ssh credential dirs. Each token is anchored on a boundary that holds
* both for a bare `file_path` (start or a separator) AND for a token embedded in
* a shell command (a preceding space, quote, `=`, or `:`), so `rm -rf .env` and
* `cat .env.local` match while ordinary words (`environment`, `prevent`,
* `README.md`) do not. The separator classes admit `\` as well as `/`, since a
* `pwsh` command carries native Windows paths.
*/
const SECRET_PATH = /(?:^|[\s/"'=:\\])\.env(?:\.[\w.-]+)?\b|\.pem\b|\bid_rsa\b|\bid_ed25519\b|\bcredentials(?:\.\w+)?\b|\.aws[\\/]credentials|(?:^|[\s/"'=:\\])\.ssh[\\/]/i;
function shellCommandMatches(name, args, perShell) {
	if (!SHELL_TOOLS.has(name)) return false;
	const command = argStr(args, "command").replace(/[ \t]+/g, " ");
	return perShell[name].some((pattern) => pattern.test(command));
}
/**
* The shipped guard presets, in evaluation order. `deny` presets precede `ask`
* presets so a hard block wins over a confirmation when both would match one
* call. Within an action the order is stable.
*/
const GUARD_PRESETS = [
	{
		id: guardId("readonly"),
		name: "readonly",
		description: "Read-only mode: block file write/create/edit tools and common in-place shell writers (tee, sed -i, dd of=). Defense-in-depth, not a sealed sandbox — exotic shell writes and MCP write tools are out of scope.",
		action: "deny",
		reason: "Blocked by the \"readonly\" guard preset: file writes/edits are disabled for this agent. Turn the readonly guard off to allow edits.",
		matches: (name, args) => {
			if (FILE_WRITE_TOOLS.has(name)) return true;
			if (name === STR_REPLACE_EDITOR) return !EDITOR_READ_COMMANDS.has(argStr(args, "command"));
			return shellCommandMatches(name, args, {
				bash: [READONLY_SHELL_WRITE],
				pwsh: [READONLY_SHELL_WRITE, PS_READONLY_WRITE]
			});
		}
	},
	{
		id: guardId("protect-secrets"),
		name: "protect-secrets",
		description: "Block reads/writes and shell access to secret files (.env, keys, credentials).",
		action: "deny",
		reason: "Blocked by the \"protect-secrets\" guard preset: this call touches a secret-bearing path (.env, private key, or credentials). Turn the protect-secrets guard off to allow it.",
		matches: (name, args) => {
			if (SECRET_PATH.test(argStr(args, "file_path"))) return true;
			if (SECRET_PATH.test(argStr(args, "path"))) return true;
			if (SECRET_PATH.test(argStr(args, "include"))) return true;
			const globPattern = argStr(args, "pattern");
			if (globPattern && name === "glob" && SECRET_PATH.test(globPattern.replace(/[*?[\]{}]/g, ""))) return true;
			return shellCommandMatches(name, args, {
				bash: [SECRET_PATH],
				pwsh: [SECRET_PATH]
			});
		}
	},
	{
		id: guardId("dangerous-shell"),
		name: "dangerous-shell",
		description: "Confirm dangerous shell commands (rm -rf, dd, mkfs, curl | sh, fork bombs).",
		action: "ask",
		reason: "The \"dangerous-shell\" guard flagged this command for confirmation.",
		matches: (name, args) => shellCommandMatches(name, args, {
			bash: [DANGEROUS_SHELL],
			pwsh: [
				DANGEROUS_SHELL,
				PS_DANGEROUS,
				PS_ENCODED
			]
		})
	},
	{
		id: guardId("no-destructive-git"),
		name: "no-destructive-git",
		description: "Confirm destructive git (push --force, reset --hard, clean -fd, branch -D).",
		action: "ask",
		reason: "The \"no-destructive-git\" guard flagged this git command for confirmation.",
		matches: (name, args) => shellCommandMatches(name, args, {
			bash: [DESTRUCTIVE_GIT],
			pwsh: [DESTRUCTIVE_GIT]
		})
	},
	{
		id: guardId("no-network"),
		name: "no-network",
		description: "Confirm outbound network (web search/fetch, curl/wget, git push, npm publish).",
		action: "ask",
		reason: "The \"no-network\" guard flagged this outbound-network action for confirmation.",
		matches: (name, args) => {
			if (NETWORK_TOOLS.has(name)) return true;
			return shellCommandMatches(name, args, {
				bash: [NETWORK_CMD],
				pwsh: [
					NETWORK_CMD,
					PS_NETWORK,
					PS_ENCODED
				]
			});
		}
	}
];
/** The full guard id universe, for the resolver and projection. */
const GUARD_IDS = GUARD_PRESETS.map((p) => p.id);
/**
* The guard inventory rows. Guards are always offered (the `tools/pre-execute`
* seam is core to the tool runtime, always present); their opt-in default is
* expressed by the resolver fallback, not by hiding the rows.
* @returns one descriptor per shipped preset, in evaluation order.
*/
function collectGuards() {
	return GUARD_PRESETS.map((p) => ({
		id: p.id,
		name: p.name,
		description: p.description,
		kind: "guard",
		guardAction: p.action
	}));
}
/**
* Pure guard evaluation: the first active preset (deny presets first) whose
* predicate matches a call decides it. No live agent, no ctx — the entire
* matching core is exercised by unit tests through this function.
* @param active - the guard ids resolved active for this agent.
* @param name - the pending call's tool name.
* @param args - the pending call's parsed arguments (any shape; coerced).
* @returns the decisive hit, or null when no active preset matches (→ allow).
*/
function evaluateGuards(active, name, args) {
	const argObj = args !== null && typeof args === "object" ? args : {};
	for (const action of ["deny", "ask"]) for (const preset of GUARD_PRESETS) {
		if (preset.action !== action) continue;
		if (!active.has(preset.id)) continue;
		if (!preset.matches(name, argObj)) continue;
		const decision = action === "deny" ? {
			kind: "deny",
			reason: preset.reason
		} : {
			kind: "ask",
			reason: preset.reason
		};
		return {
			id: preset.id,
			decision
		};
	}
	return null;
}
/**
* Install the guard enforcement listener on a scoped context when at least one
* preset is active. A single scoped `tools/pre-execute` listener runs the pure
* `evaluateGuards` over each call; a decisive match counts a hit (via `onHit`)
* and returns its decision, otherwise the call passes through with `next()`.
*
* PREPEND: the decision must win over any later pre-execute listener, so we
* register at the head. SCOPE: the caller passes the agent's scoped context and
* only calls this with a real scope, so the listener is filtered to this agent.
*
* @param scopedCtx - the agent-scoped context (its scope tag filters dispatch).
* @param active - the guard ids resolved active for this agent.
* @param onHit - invoked with the preset id each time a call is denied/asked.
* @param confirmer - optional blocking user-confirmation channel; when present,
*   the user's answer wins over the preset's fixed action.
* @returns a disposer array: one listener disposer when any guard is active,
*   empty when none are (nothing installed).
*/
function applyGuards(scopedCtx, active, onHit, confirmer) {
	if (active.size === 0) return [];
	return [scopedCtx.on("tools/pre-execute", (exec, next) => {
		let hit;
		try {
			hit = evaluateGuards(active, exec.name, exec.arguments);
		} catch {
			return Promise.resolve({
				kind: "deny",
				reason: "Blocked: a guard preset failed to evaluate this call, so it was denied (fail closed)."
			});
		}
		if (hit === null) return next();
		try {
			onHit(hit.id);
		} catch {}
		if (confirmer === void 0) return Promise.resolve(hit.decision);
		const argObj = exec.arguments !== null && typeof exec.arguments === "object" ? exec.arguments : {};
		return confirmer({
			toolName: exec.name,
			args: argObj,
			hit,
			signal: exec.signal
		}).then((answer) => {
			if (answer === "allow") return next();
			if (answer === "deny") return {
				kind: "deny",
				reason: `Blocked: the user denied this call (guard "${hit.id}").`
			};
			return hit.decision;
		}, () => ({
			kind: "deny",
			reason: "Blocked: the guard confirmation channel failed, so this call was denied (fail closed)."
		}));
	}, { prepend: true })];
}
//#endregion
//#region lib/types/host/inventory.js
/**
* Capability inventory: enumerate the switchable skills, MCP server groups, and
* plain tools visible to one agent scope, as the descriptor rows the UI lists
* and the id universe the resolver evaluates against.
*
* Three kinds, three sources:
*   - `skill`: `ctx.skills.snapshot({ scope })` — every model-invocable skill
*     summary (name + routing description).
*   - `mcp`:   tools named `mcp__<server>__<rawName>` (the mcp-client public
*     name grammar), grouped by `<server>` into one group row that carries its
*     member tools. Each member gets its OWN switch, and the group's `mcp:<server>`
*     switch is the members' default (see shared/resolve.ts `mcpMemberStance`):
*     MCP tools are opt-in, so a member with nothing set anywhere is disabled.
*     A group with no member enabled shadows the server's `mcp:<server>`
*     instructions section, and shared resource calls naming it are refused.
*   - `tool`:  every other model-facing tool from `ctx.tools.schemas(scope)`.
*
* The switch id namespaces are disjoint: `skill:<name>`, `mcp:<server>`,
* `mcptool:<server>/<rest>`, `tool:<name>`. This keeps one flat OverrideMap
* unambiguous across kinds.
*
* @module dsh-capability-toggle-plugin/host/inventory
*/
/** Prefix marking an MCP public tool name; capture group 1 is the server. */
const MCP_NAME = /^mcp__([A-Za-z0-9_-]{1,32})__/;
/**
* The shared resource tools `dsh-mcp-resources` registers for every configured
* server. Each takes the target server as its `server` argument, so a call
* through one of them reaches that server — it must attribute to the server's
* `mcp:<server>` switch, not to the shared tool row.
*/
const MCP_RESOURCE_TOOLS = /* @__PURE__ */ new Set([
	"list_mcp_resources",
	"list_mcp_resource_templates",
	"read_mcp_resource"
]);
const SKILL_TOOL_NAME = "skill";
/** Build the `skill:<name>` switch id. */
function skillId(name) {
	return `skill:${name}`;
}
/** Build the `mcp:<server>` switch id. */
function mcpId(server) {
	return `mcp:${server}`;
}
/**
* Build the `mcptool:<server>/<rawName>` switch id for ONE member tool of a
* server, where `rawName` is the public name after `mcp__<server>__`. Distinct
* from {@link mcpId}: the group id is the member's default, the member id is the
* tool's own switch.
*/
function mcpToolId(server, rawName) {
	return `mcptool:${server}/${rawName}`;
}
/** Build the `tool:<name>` switch id. */
function toolId(name) {
	return `tool:${name}`;
}
/**
* Attribute one model tool call to the switch id whose row should count it.
* An MCP call counts on its MEMBER switch (`mcptool:<server>/<rest>`), so the
* per-tool rows carry their own usage and the server row shows the sum; skills
* count on the invoked skill (the loader tool's argument), not on `skill`; a
* shared MCP resource call counts on the server group it names; every other tool
* counts on its own `tool:<name>` row.
* @param name - the model-facing tool name that ran.
* @param args - that call's arguments (used for the skill loader and the shared
*   MCP resource tools, which name their target server).
* @returns the switch id to credit, or undefined when nothing should be.
*/
function attributeCall(name, args) {
	if (name === SKILL_TOOL_NAME) {
		const skillName = args?.name;
		return typeof skillName === "string" && skillName !== "" ? skillId(skillName) : void 0;
	}
	if (MCP_RESOURCE_TOOLS.has(name)) {
		const server = args?.server;
		return typeof server === "string" && server !== "" ? mcpId(server) : toolId(name);
	}
	const mcp = MCP_NAME.exec(name);
	return mcp !== null ? mcpToolId(mcp[1], name.slice(mcp[0].length)) : toolId(name);
}
/**
* Enumerate every switchable capability for one agent scope. Pure read: it
* registers nothing and mutates no state.
* @param ctx - a context that can read `skills` and `tools`.
* @param scope - the agent scope key to view, or undefined for the global view.
* @param cwd - the agent's session cwd, so project-level skill roots
*   (`<projectRoot>/.dsh/skills`, `<projectRoot>/.agents/skills`) are
*   discovered; omitted (or `''`) yields only the user/bundled roots.
* @param onDrift - optional warn-once sink for unexpected framework shapes.
* @returns descriptors in tab order (skills, then mcps, then tools), each tab
*   sorted by name.
*/
async function collectInventory(ctx, scope, cwd, onDrift) {
	const skills = await collectSkills(ctx, scope, cwd, onDrift);
	const { mcps, tools } = collectTools(ctx, scope, onDrift);
	const prompts = await collectPromptGates(ctx, scope);
	const approval = collectApprovalGate(ctx);
	const guards = collectGuards();
	return [
		...skills,
		...mcps,
		...tools,
		...prompts,
		...approval,
		...guards
	];
}
/** Skill rows: one per model-invocable skill, sorted by name. */
async function collectSkills(ctx, scope, cwd, onDrift) {
	const options = {};
	if (scope !== void 0) options.scope = scope;
	if (cwd !== void 0 && cwd !== "") options.cwd = cwd;
	const snapshot = await ctx.skills.snapshot(options);
	if (!Array.isArray(snapshot?.skills)) {
		onDrift?.("skills.snapshot.shape", "capability-toggle: skills.snapshot() returned no `skills` array (DSH skills surface may have changed); the skills tab will be empty.");
		return [];
	}
	return snapshot.skills.map((skill) => ({
		id: skillId(skill.name),
		name: skill.name,
		description: skill.description,
		kind: "skill"
	})).sort(byName);
}
/**
* Tool rows split into MCP server groups and plain tools. Every MCP member tool
* keeps its OWN switch id so it can be enabled or disabled on its own; the group
* row still carries them all, because its switch is their default. The `skill`
* tool itself is excluded — skills are switched on the skills tab, and denying
* the loader tool would be a coarser, confusing duplicate.
*/
function collectTools(ctx, scope, onDrift) {
	const schemas = ctx.tools.schemas(scope);
	const mcpMembers = /* @__PURE__ */ new Map();
	const plain = [];
	if (schemas == null || typeof schemas[Symbol.iterator] !== "function") {
		onDrift?.("tools.schemas.shape", "capability-toggle: tools.schemas() is not iterable (DSH tools surface may have changed); the tools and MCP tabs will be empty.");
		return {
			mcps: [],
			tools: []
		};
	}
	for (const schema of schemas) {
		if (typeof schema?.name !== "string") {
			onDrift?.("tools.schemas.name", "capability-toggle: a tool schema had no string `name` (DSH tool-schema shape may have changed); that entry is skipped.");
			continue;
		}
		if (schema.name === SKILL_TOOL_NAME) continue;
		const mcp = MCP_NAME.exec(schema.name);
		if (mcp !== null) {
			const server = mcp[1];
			const list = mcpMembers.get(server) ?? [];
			list.push({
				id: mcpToolId(server, schema.name.slice(mcp[0].length)),
				name: schema.name,
				description: schema.description ?? ""
			});
			mcpMembers.set(server, list);
			continue;
		}
		plain.push({
			id: toolId(schema.name),
			name: schema.name,
			description: schema.description ?? "",
			kind: "tool"
		});
	}
	const mcps = [...mcpMembers.entries()].map(([server, members]) => ({
		id: mcpId(server),
		name: server,
		description: `MCP server "${server}" — ${members.length} tool(s)`,
		kind: "mcp",
		memberTools: members.slice().sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
	})).sort(byName);
	plain.sort(byName);
	return {
		mcps,
		tools: plain
	};
}
/** Sort descriptors by display name using code-point order. */
function byName(a, b) {
	return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}
/**
* Map every disabled switch id to the concrete tool names it denies, for one
* inventory. A `tool:<name>` denies that tool; an `mcptool:<server>/<rest>`
* denies exactly its one member tool; a `skill:<name>` denies nothing here
* (skills are enforced by scoped shadow, not tool restriction).
*
* The GROUP id `mcp:<server>` denies nothing on its own, deliberately: it is the
* members' default, and the resolver already folded it into each member's
* effective stance (`disabledIdsForInventory`). Re-checking it here would let a
* group OFF kill a member explicitly switched ON at the same level, which is the
* opposite of the "more specific statement wins" rule the panel shows.
* @param descriptors - the inventory.
* @param disabledIds - the switch ids resolved to disabled.
* @returns the concrete tool names to deny through `ctx.tools.restrict`.
*/
function deniedToolNames(descriptors, disabledIds) {
	const denied = [];
	for (const d of descriptors) {
		if (d.kind === "tool") {
			if (disabledIds.has(d.id)) denied.push(d.name);
			continue;
		}
		if (d.kind === "mcp" && d.memberTools !== void 0) {
			for (const m of d.memberTools) if (disabledIds.has(m.id)) denied.push(m.name);
		}
	}
	return denied;
}
/**
* The disabled skill names from an inventory, for scoped shadowing.
* @param descriptors - the inventory.
* @param disabledIds - the switch ids resolved to disabled.
* @returns the skill names to shadow with a non-model-invocable stub.
*/
function disabledSkillNames(descriptors, disabledIds) {
	const names = [];
	for (const d of descriptors) if (d.kind === "skill" && disabledIds.has(d.id)) names.push(d.name);
	return names;
}
/**
* Map every disabled PLAIN tool to the name of its usage-guidance prompt
* section, so the section can be shadowed away when the tool is off. By
* convention each tool contributes one `systemPrompt.section` named
* `tool:<toolName>` (e.g. `tool:bash`, `tool:web_search`) — the same string as
* our `tool:<name>` switch id, which is exactly why the switch id doubles as
* the section name here.
*
* Only plain tools qualify:
*   - `skill` rows use the skill-shadow seam and have no such section.
*   - `mcp` group rows shadow their instructions section through
*     {@link disabledMcpInstructionSections} instead — their member tools'
*     guidance sections (if any) are named after the members, not the group.
*
* Shadowing a section is best-effort cosmetics (it saves prompt tokens and
* removes stale guidance for an already-denied tool); a tool that ships no
* such section simply has its empty shadow render to nothing, which is inert.
* @param descriptors - the inventory.
* @param disabledIds - the switch ids resolved to disabled.
* @returns the `tool:<name>` guidance section names to shadow with empty text.
*/
function disabledToolGuidanceSections(descriptors, disabledIds) {
	const names = [];
	for (const d of descriptors) if (d.kind === "tool" && disabledIds.has(d.id)) names.push(`tool:${d.name}`);
	return names;
}
/**
* Map every disabled MCP server group to the name of its instructions prompt
* section. `dsh-mcp-client` registers each connected server's instruction
* snapshot (the `### MCP server: <name>` block the server itself supplies) as
* one `systemPrompt.section` named exactly `mcp:<serverName>` — the same
* string as our `mcp:<server>` switch id — so the id doubles as the section
* name, exactly like the plain-tool guidance case above.
*
* Without this shadow a switched-off server's instructions stay in the model's
* prompt and keep issuing directives (e.g. "make kb.recall your first tool
* call") for tools the deny already removed, which is prompt injection the
* user cannot switch off any other way.
*
* @param descriptors - the inventory.
* @param disabledIds - the switch ids resolved to disabled.
* @returns the `mcp:<server>` instructions section names to shadow with empty
*   text.
*/
function disabledMcpInstructionSections(descriptors, disabledIds) {
	const names = [];
	for (const d of descriptors) if (d.kind === "mcp" && disabledIds.has(d.id)) names.push(d.id);
	return names;
}
//#endregion
//#region lib/types/host/capability-gate.js
/** Prefix of an MCP MEMBER switch id: `mcptool:<server>/<rest>`. */
const MCP_MEMBER_PREFIX = "mcptool:";
/**
* The server group id an MCP member id belongs to, or undefined when `id` is not
* a member id. The member id carries `<server>/<rest>`; the server is the
* segment before the first slash (a server name may itself contain no slash).
*/
function mcpGroupOf(id) {
	if (!id.startsWith(MCP_MEMBER_PREFIX)) return void 0;
	const rest = id.slice(8);
	const slash = rest.indexOf("/");
	if (slash <= 0) return void 0;
	return mcpId(rest.slice(0, slash));
}
const FAIL_CLOSED_REASON = "Blocked: the capability switch could not be resolved for this call, so it was denied (fail closed).";
function evaluateCapabilityGate(readLayered, exec) {
	try {
		const id = typeof exec?.name === "string" ? attributeCall(exec.name, exec.arguments) : void 0;
		if (id === void 0) return { action: "pass" };
		const overrides = readLayered();
		const groupId = mcpGroupOf(id);
		if (groupId === void 0 ? isDisabled(overrides, id) : isMcpMemberDisabled(overrides, id, groupId)) return {
			action: "deny",
			reason: `Blocked: capability-toggle has this capability (${id}${groupId === void 0 ? "" : ` via ${groupId}`}) switched off.`
		};
		return { action: "pass" };
	} catch {
		return {
			action: "deny",
			reason: FAIL_CLOSED_REASON
		};
	}
}
function applyCapabilityGate(scopedCtx, readLayered) {
	return scopedCtx.on("tools/pre-execute", (exec, next) => {
		const decision = evaluateCapabilityGate(readLayered, exec);
		if (decision.action === "pass") return next();
		return Promise.resolve({
			kind: "deny",
			reason: decision.reason
		});
	}, { prepend: true });
}
//#endregion
//#region lib/types/host/confirm.js
/**
* The plugin-owned blocking confirmation channel.
*
* WHY THIS EXISTS (not the native `ask`/approval seam): a guard that returns
* `{ kind: 'ask' }` is routed by the tool runtime through `approval.request()`,
* whose `decide()` short-circuits to `'rejected'` the instant the session's
* effective approval policy is `'never'` (the `danger-full-access` permission
* preset) — BEFORE the `approval/request` waterfall is dispatched, so the
* browser answerer is never consulted and NO prompt is shown. So this module
* registers the confirmation itself, outside the approval policy.
*
* @module dsh-capability-toggle-plugin/host/confirm
*/
/**
* Build the human detail for one guarded call.
*
* A shell command is returned VERBATIM: truncating it would hide a dangerous
* suffix (a long heredoc whose final line is `rm -rf /`) from the user who is
* being asked to approve that exact command. Non-shell arguments are bounded,
* because a `write` call carries a whole file body that no card can show.
*/
function buildConfirmDetail(toolName, args) {
	if (SHELL_TOOLS.has(toolName) && typeof args["command"] === "string") return args["command"];
	let json;
	try {
		json = JSON.stringify(args) ?? "";
	} catch {
		json = String(args);
	}
	return bound(json);
}
/** Upper bound on pushed non-shell detail, so a huge arg cannot bloat SSE. */
const DETAIL_LIMIT = 8e3;
function bound(text) {
	return text.length <= DETAIL_LIMIT ? text : `${text.slice(0, DETAIL_LIMIT)}…`;
}
/**
* Registry of live confirmations and their browser channels, keyed by session.
* One instance per Host activation, shared by every agent binding and the HTTP
* routes.
*/
var ConfirmationCenter = class {
	channels = /* @__PURE__ */ new Map();
	pending = /* @__PURE__ */ new Map();
	disposers = /* @__PURE__ */ new WeakMap();
	disposed = false;
	hasChannel(session) {
		const set = this.channels.get(session);
		return set !== void 0 && set.size > 0;
	}
	subscribe(session, sink) {
		if (this.disposed) {
			sink.end();
			return () => {};
		}
		let set = this.channels.get(session);
		if (set === void 0) {
			set = /* @__PURE__ */ new Set();
			this.channels.set(session, set);
		}
		set.add(sink);
		this.push(sink, { snapshot: this.pendingFor(session) });
		for (const entry of this.pending.get(session)?.values() ?? []) this.push(sink, confirmEvent(entry));
		let done = false;
		const dispose = () => {
			if (done) return;
			done = true;
			this.disposers.delete(sink);
			const cur = this.channels.get(session);
			if (cur !== void 0) {
				cur.delete(sink);
				if (cur.size === 0) this.channels.delete(session);
			}
			try {
				sink.end();
			} catch {}
		};
		this.disposers.set(sink, dispose);
		return dispose;
	}
	/**
	* Register a blocking confirmation for a session. Resolves when a browser
	* answers, the caller's signal aborts, or the center is disposed; `cancelled`
	* covers both abort and dispose.
	*/
	request(session, payload, signal) {
		if (signal?.aborted || this.disposed) return Promise.resolve("cancelled");
		return new Promise((resolve) => {
			const id = randomUUID();
			let settled = false;
			const settle = (outcome) => {
				if (settled) return;
				settled = true;
				const map = this.pending.get(session);
				if (map !== void 0) {
					map.delete(id);
					if (map.size === 0) this.pending.delete(session);
				}
				if (signal !== void 0 && onAbort !== void 0) signal.removeEventListener("abort", onAbort);
				this.broadcast(session, {
					id,
					resolved: true
				});
				resolve(outcome);
			};
			const onAbort = signal === void 0 ? void 0 : () => {
				settle("cancelled");
			};
			const entry = {
				id,
				payload,
				settle
			};
			let map = this.pending.get(session);
			if (map === void 0) {
				map = /* @__PURE__ */ new Map();
				this.pending.set(session, map);
			}
			map.set(id, entry);
			if (signal !== void 0 && onAbort !== void 0) signal.addEventListener("abort", onAbort, { once: true });
			this.broadcast(session, confirmEvent(entry));
		});
	}
	/** Answer one pending confirmation (first-wins); false if it never existed or already settled. */
	respond(session, id, decision) {
		const entry = this.pending.get(session)?.get(id);
		if (entry === void 0) return false;
		entry.settle(decision);
		return true;
	}
	pendingFor(session) {
		return [...this.pending.get(session)?.values() ?? []].map((e) => ({
			id: e.id,
			...e.payload
		}));
	}
	get isDisposed() {
		return this.disposed;
	}
	/** Cancel every pending confirmation and end every sink; called on plugin unload. */
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		for (const map of this.pending.values()) for (const entry of map.values()) entry.settle("cancelled");
		this.pending.clear();
		for (const set of this.channels.values()) for (const sink of set) try {
			sink.end();
		} catch {}
		this.channels.clear();
	}
	broadcast(session, event) {
		for (const sink of this.channels.get(session) ?? []) this.push(sink, event);
	}
	push(sink, event) {
		try {
			if (!sink.write(`data: ${JSON.stringify(event)}\n\n`)) return;
		} catch {
			this.drop(sink);
		}
	}
	drop(sink) {
		const dispose = this.disposers.get(sink);
		if (dispose !== void 0) dispose();
	}
};
function confirmEvent(entry) {
	return {
		id: entry.id,
		...entry.payload
	};
}
/**
* Build the {@link GuardConfirmer} one agent binding hands to `applyGuards`.
*
* Returning `null` (no browser subscribed) means "fall back to the preset's
* legacy decision" rather than blocking a headless turn forever. `deny` and
* `cancelled` both map to `deny` so a cancellation can never read as consent,
* and an already-disposed/aborted call denies outright instead of downgrading
* to the legacy `ask` fallback — that downgrade would let a `never`-policy
* session's blocked call slip through.
*/
function makeGuardConfirmer(center, session) {
	return async (req) => {
		if (center.isDisposed || req.signal.aborted) return "deny";
		if (!center.hasChannel(session)) return null;
		return await center.request(session, {
			guardId: req.hit.id,
			guardAction: req.hit.decision.kind,
			reason: req.hit.decision.reason ?? "",
			toolName: req.toolName,
			detail: buildConfirmDetail(req.toolName, req.args)
		}, req.signal) === "allow" ? "allow" : "deny";
	};
}
//#endregion
//#region lib/types/host/stats.js
function applyCallStats(scopedCtx, onCall) {
	return scopedCtx.on("tools/result", (exec) => {
		let id;
		try {
			id = typeof exec?.name === "string" ? attributeCall(exec.name, exec.arguments) : void 0;
		} catch {
			return;
		}
		if (id === void 0) return;
		try {
			onCall(id);
		} catch {
			return;
		}
	});
}
//#endregion
//#region lib/types/host/self-check.js
/**
* Framework-contract self-check: the assumptions this plugin makes about the
* DSH/Cordis surfaces it binds to, made observable.
*
* WHY THIS EXISTS. Every enforcement seam here is a silent-failure risk on a
* framework upgrade: `ctx.on('tools/pre-execute', …)` registered against a
* renamed (or re-routed) event does NOT throw — it installs a listener that is
* simply never called, so a guard or the approval lock quietly stops matching
* (fail-OPEN, the worst direction for a control). TypeScript catches a renamed
* event only at the plugin's OWN compile; a host upgrade that ships new surfaces
* while this plugin runs its already-built `lib/` gets no compile signal and no
* runtime error. This module cannot re-add a compile check at runtime, but it
* turns the invisible assumptions into (a) one startup line an operator can grep
* when auditing an upgrade, and (b) warn-once drift alarms when a surface this
* plugin reads returns a shape it did not expect.
*
* It changes NO enforcement behavior and adds no per-call cost: the banner logs
* once at activation, and the drift alarms fire only off the shape checks the
* inventory path already performs, deduped so a persistent drift cannot spam.
*
* @module dsh-capability-toggle-plugin/host/self-check
*/
const SCOPE_IDENTITY_DRIFT_KEY = "scope.identity";
function scopeIdentityDrift(scopeKey) {
	if (scopeKey !== void 0) return null;
	return "capability-toggle: this agent carries no dsh-scope tag, so per-agent enforcement is inoperative and the panel can only list globally registered capabilities (the skills tab collapses to global skills while tools, MCP groups and guards still look correct). dsh-agent-loop mints a scope for every agent, so a missing tag means the read went through a SECOND copy of @deepseek-ai/dsh-scope: scope identity is a module-private Symbol plus private WeakMaps, which a duplicate copy cannot read. Make the framework packages resolve to the host's copy — declare every @deepseek-ai/* package as a peerDependency and keep a second copy out of this plugin's own node_modules.";
}
/**
* The framework contract this plugin depends on, in one place. Kept as data (not
* scattered string literals) so the banner, the audit trail, and a future
* compatibility test all read the SAME source of truth. Update this when a seam
* moves — the banner then advertises the new assumption automatically.
*/
const FRAMEWORK_CONTRACT = {
	/** Services whose absence makes the whole plugin fail to activate (via `inject`). */
	requiredServices: [
		"agents",
		"configEditor",
		"tools",
		"skills",
		"systemPrompt",
		"webServer",
		"connection"
	],
	/**
	* Members each required service must still expose. A surviving service NAME is
	* not enough: DSH 0.1.7 kept `settings` while dropping the method this plugin
	* called, and the 0.2 config seam replaced that service entirely, so a
	* presence-only probe reports a healthy host until the first write.
	*/
	serviceShapes: { configEditor: ["edit"] },
	/** Services probed non-strictly; absence degrades one family, not the plugin. */
	optionalServices: ["approval"],
	/**
	* The enforcement events a scoped listener claims. A rename here turns a guard
	* or the approval lock into dead code with no runtime error — the single most
	* important line to check after a DSH upgrade.
	*/
	enforcementEvents: ["tools/pre-execute", "approval/request"],
	/**
	* The agent-lifecycle events this plugin tracks. `agent/created` mints a
	* binding; `agent/disposed` drops it (and its scope fiber + hit tally). The
	* disposed event is load-bearing for MEMORY: it is the only path that removes
	* a binding from the live map, so a rename/miss upstream would strand one
	* binding per agent that ever started — a slow leak with no runtime error.
	*/
	lifecycleEvents: ["agent/created", "agent/disposed"],
	/** The `Execution` field the pre-execute waterfall routes scope by. */
	scopeRoutingKey: "exec.agent",
	/** The MCP public-tool name grammar, and the per-member switch id derived from it. */
	mcpNameGrammar: "mcp__<server>__<tool> → mcptool:<server>/<tool>",
	/** The Loader entry holding the three-level override document. */
	configEntry: "dsh-capability-toggle-plugin"
};
/**
* Log one activation banner naming the framework assumptions enforcement rests
* on. This is the anchor an operator greps when a guard or lock "stopped
* working" after an upgrade: if a listed event or routing key was renamed
* upstream, the seam fails silently, and this line is the record of what the
* running build assumed. Logged at `info` once per activation.
* @param ctx - the Host context, for its logger.
*/
function emitContractBanner(ctx) {
	const c = FRAMEWORK_CONTRACT;
	ctx.logger.info(`active — enforcement binds events [${c.enforcementEvents.join(", ")}] scoped by "${c.scopeRoutingKey}", switches MCP tools by "${c.mcpNameGrammar}" (opt-in: a member with nothing set anywhere is denied), tracks agent lifecycle via [${c.lifecycleEvents.join(", ")}]. If a DSH upgrade renames an enforcement event, the affected guard/lock stops matching WITHOUT error (fail-open); if it renames "agent/disposed", per-agent bindings stop being reclaimed (slow memory leak). Grep this line when auditing an upgrade.`);
}
/**
* Verify each required service actually resolves AND still exposes the members
* this plugin calls. `inject` already gates activation on resolution, so a miss
* here means the inject contract itself changed (a required service was
* renamed/removed upstream) — an `error`-level signal, not a mere warning,
* because enforcement is then partially inoperative. Resolution alone cannot see
* a service that kept its name and lost a method, which is exactly how the 0.1.7
* settings change presented.
* @param ctx - the Host context.
* @returns the names that failed to resolve or lost a required member (empty
*   when every service is present and shaped as expected).
*/
function checkRequiredServices(ctx) {
	const shapes = FRAMEWORK_CONTRACT.serviceShapes;
	const absent = [];
	const shapeless = [];
	for (const name of FRAMEWORK_CONTRACT.requiredServices) {
		const service = ctx.get(name, false);
		if (service === void 0) {
			absent.push(name);
			continue;
		}
		if ((shapes[name] ?? []).some((member) => typeof service[member] !== "function")) shapeless.push(name);
	}
	const failed = [...absent, ...shapeless];
	if (failed.length > 0) {
		const findings = [];
		if (absent.length > 0) findings.push(`absent despite inject: [${absent.join(", ")}]`);
		if (shapeless.length > 0) findings.push(`present but missing a member this plugin calls: [${shapeless.join(", ")}]`);
		ctx.logger.error(`required service(s) ${findings.join("; ")}. A DSH upgrade may have renamed or removed them; enforcement is degraded.`);
	}
	return failed;
}
/**
* Build a warn-once sink: the first message per key logs at `warn`, repeats are
* dropped. Drift (a surface returning an unexpected shape) persists across every
* reconcile, so an un-deduped warn would flood the log; the key lets one alarm
* stand for a whole class of repeated drift.
* @param ctx - the Host context, for its logger.
* @returns a `(key, message)` sink that logs each distinct key once.
*/
function makeWarnOnce(ctx) {
	const seen = /* @__PURE__ */ new Set();
	return (key, message) => {
		if (seen.has(key)) return;
		seen.add(key);
		ctx.logger.warn(message);
	};
}
//#endregion
//#region lib/types/host/agent-binding.js
/**
* One live agent's enforcement binding. For a single agent it resolves the
* effective disabled set (session over project over global over default-enabled)
* and applies it to the agent's own scope across three seams:
*
*   - tools: `tools.restrict({ deny })` removes every disabled plain tool and
*     every disabled MCP member tool (each MCP tool has its own switch, resolved
*     member-over-server-group-over-off; see shared/resolve.ts) from the agent's
*     inherited surface. A denied tool leaves the model schema set, so the next
*     `request/header` snapshot no longer advertises it, and any call the model
*     still attempts is refused by the restriction.
*   - skills: for each disabled skill, `skills.register` installs a same-name
*     runtime skill with `modelInvocable:false` in the agent's scope layer. The
*     registry merges the agent layer after global (`merged.set` overwrites),
*     so the stub shadows the real skill, and tool-skill's `isModelInvocable`
*     filter then drops it from the `<available_skills>` catalog. Registering /
*     disposing invalidates the skill catalog cache, so a mid-session toggle
*     takes effect on the next agent step — no restart.
*   - prompt: disabled plain tools shadow away their `tool:<name>` guidance
*     section, disabled MCP servers shadow away their `mcp:<server>`
*     instructions section (dsh-mcp-client registers the server-supplied
*     instructions block under exactly that name), and the curated prompt-gate
*     family shadows sections/contexts or installs the runtime-context
*     suppressor (see ./prompt.ts).
*
* Reconcile is latest-wins: any store change disposes the current application
* and installs a fresh one from the current inventory and overrides.
*
* @module dsh-capability-toggle-plugin/host/agent-binding
*/
/**
* Order for our empty guidance-shadow sections. Any finite number works: an
* empty section is dropped at render regardless of order, and the shadow wins
* its name in the scope-chain merge by scope, not by order. Kept in the tool
* guidance band (100–199) for tidiness when inspecting an assembly.
*/
const GUIDANCE_SHADOW_ORDER = 150;
/** Resolve the project key (absolute cwd) an agent's project level binds to. */
function projectKeyOf(agent) {
	return agent.session.header.cwd ?? "";
}
/** Human label for the level a shadowed skill's stub attributes itself to. */
function scopeLabel(projectKey) {
	return projectKey === "" ? "session" : "session/project/global scope";
}
/**
* One live agent's enforcement binding. Holds the agent identity plus the
* disposers of the current application generation, and re-derives them on
* demand. Not reused across agents.
*/
var AgentBinding = class {
	store;
	agent;
	center;
	onDrift;
	scopeKey;
	/**
	* A context that inherits THIS plugin's `skills`/`tools` inject but carries
	* the agent's scope tag. Both seams read the caller's scope via
	* `scopeOf(this.ctx)` AND are gated by Cordis's per-fiber inject guard, so
	* `agent.ctx` cannot be used directly: its fiber does not inject `skills`, so
	* `agent.ctx.skills` throws "cannot get property skills without inject". This
	* scoped context passes the guard (host inject) while landing restrict() /
	* register() in the agent's own layer (agent scope tag).
	*/
	scope;
	scopedCtx;
	projectKey;
	sessionKey;
	/** Disposers for the current application generation. */
	disposers = [];
	/** Monotonic generation, so a slow reconcile cannot overwrite a newer one. */
	generation = 0;
	/**
	* The last PRISTINE inventory — captured inside reconcile's dispose window,
	* before our own enforcement is re-applied. Serving the UI from this cache is
	* mandatory: `tools.schemas(scope)` returns only the VISIBLE set (a denied
	* tool vanishes) and `skills.snapshot(scope)` returns the SHADOW's stub
	* description, so a live read while enforcement is applied would drop
	* toggled-off tools from the panel (making them impossible to re-enable) and
	* mislabel toggled-off skills. `null` until the first reconcile.
	*/
	lastInventory = null;
	/**
	* Per-guard hit counters for THIS agent, keyed by `guard:<name>` id. A guard
	* listener increments the count each time it denies/asks a call. This is
	* RUNTIME state, not persisted: it lives on the binding for the agent's
	* lifetime and is deliberately NOT cleared by `dispose()` (a reconcile that
	* reinstalls the listeners must not reset a running tally), only dropped when
	* the agent goes away with the binding. The projection reads it so the panel
	* can show "blocked N calls" per guard row.
	*/
	guardHits = /* @__PURE__ */ new Map();
	callHits = /* @__PURE__ */ new Map();
	/**
	* @param store - the shared override store.
	* @param hostCtx - this plugin's context (injects `skills` and `tools`).
	* @param agent - the live agent this binding enforces.
	* @param center - the shared blocking-confirmation registry (optional, so a
	*   binding without one keeps the legacy deny/ask behavior).
	* @param onDrift - optional warn-once sink for unexpected framework shapes
	*   seen while reading this agent's inventory (threaded to `collectInventory`).
	*/
	constructor(store, hostCtx, agent, center, onDrift) {
		this.store = store;
		this.agent = agent;
		this.center = center;
		this.onDrift = onDrift;
		this.scopeKey = scopeOf(agent.ctx);
		this.projectKey = projectKeyOf(agent);
		this.sessionKey = agent.session.id;
		const scopeDrift = scopeIdentityDrift(this.scopeKey);
		if (scopeDrift !== null) onDrift?.(SCOPE_IDENTITY_DRIFT_KEY, scopeDrift);
		this.scope = this.scopeKey === void 0 ? void 0 : createScope(hostCtx, this.scopeKey);
		this.scopedCtx = this.scope?.ctx ?? hostCtx;
	}
	/**
	* The UI's inventory: the last pristine snapshot captured by reconcile. It
	* reflects the FULL capability set (nothing our own enforcement hid), which
	* is what the panel must render so a toggled-off tool stays listed and can be
	* turned back on. Triggers a reconcile when never yet populated.
	*/
	async inventory() {
		if (this.lastInventory === null) await this.reconcile();
		return this.lastInventory ?? [];
	}
	/**
	* The last pristine inventory this binding captured, WITHOUT triggering a
	* reconcile — `null` when it has never reconciled. The registry reads it at
	* dispose time to seed its cross-lifetime fallback cache, so a panel reopened
	* after the agent goes idle can still render the persisted stances against a
	* known capability set (see ControllerRegistry.fallbackProjection). A plain
	* synchronous getter because dispose must not await a fresh scope read after
	* the agent's scope has begun tearing down.
	*/
	get knownInventory() {
		return this.lastInventory;
	}
	owns(agent) {
		return this.agent === agent;
	}
	/**
	* Read the agent's PRISTINE inventory — the full set with our own
	* enforcement lifted. Only valid to call while `this.disposers` is empty
	* (inside reconcile's dispose window); otherwise `tools.schemas` omits denied
	* tools and `skills.snapshot` returns shadow stubs.
	*/
	async pristineInventory() {
		return collectInventory(this.scopedCtx, this.scopeKey, this.agent.session.header.cwd, this.onDrift);
	}
	/**
	* The set of switch ids resolved to disabled for this agent, over an
	* already-collected inventory. The MCP family is resolved per MEMBER tool
	* (member stance, then its server group's, then the opt-in `off` default), so
	* the returned set carries the member ids the tools seam denies — see
	* `disabledIdsForInventory`.
	* @param descriptors - this agent's inventory.
	* @returns the disabled switch ids.
	*/
	disabledSet(descriptors) {
		const overrides = this.store.layered(this.projectKey, this.sessionKey);
		return new Set(disabledIdsForInventory(descriptors, overrides));
	}
	/**
	* Dispose the current application and install a fresh one from the current
	* inventory and overrides. Latest-wins: a reconcile started later always
	* ends up as the installed generation.
	*/
	async reconcile() {
		const gen = ++this.generation;
		this.dispose();
		this.installGuards();
		this.installCallStats();
		this.installCapabilityGate();
		const descriptors = await this.pristineInventory();
		if (gen !== this.generation) return;
		this.lastInventory = descriptors;
		const disabled = this.disabledSet(descriptors);
		const deny = deniedToolNames(descriptors, disabled);
		if (deny.length > 0) this.disposers.push(this.scopedCtx.tools.restrict({ deny }));
		for (const name of disabledSkillNames(descriptors, disabled)) this.disposers.push(this.scopedCtx.skills.register({
			name,
			description: `Disabled by capability-toggle for this ${scopeLabel(this.projectKey)}.`,
			source: "runtime",
			content: "",
			invocation: {
				modelInvocable: false,
				userInvocable: false
			}
		}));
		if (this.scopeKey !== void 0) {
			for (const sectionName of [...disabledToolGuidanceSections(descriptors, disabled), ...disabledMcpInstructionSections(descriptors, disabled)]) {
				const dispose = attemptShadow(() => this.scopedCtx.systemPrompt.section({
					name: sectionName,
					order: GUIDANCE_SHADOW_ORDER,
					text: ""
				}), this.onDrift, `prompt section "${sectionName}"`);
				if (dispose !== void 0) this.disposers.push(dispose);
			}
			for (const dispose of applyPromptGates(this.scopedCtx, descriptors, disabled, this.onDrift)) this.disposers.push(dispose);
			for (const dispose of applyApprovalGate(this.scopedCtx, disabled)) this.disposers.push(dispose);
		}
	}
	/**
	* Install the guard-preset enforcement listener for this agent, synchronously.
	* Called at the head of reconcile (right after dispose, before any await) so a
	* safety guard has NO fail-open window: see the call site in {@link reconcile}.
	*
	* A guard's active set is `GUARD_IDS` intersected with the synchronous store
	* read — it never needs the pristine inventory the default-on seams await for,
	* so this stays await-free. Scope-only for the same reason as the approval
	* lock: the `tools/pre-execute` scope routing key is `exec.agent`, so a
	* scopeless listener would gate every agent; a scopeless binding installs no
	* guard. A single prepended listener runs the pure matcher and counts each hit
	* on the reconcile-surviving `guardHits` tally.
	*/
	installGuards() {
		if (this.scopeKey === void 0) return;
		const overrides = this.store.layered(this.projectKey, this.sessionKey);
		const activeGuards = new Set(GUARD_IDS.filter((id) => isGuardActive(overrides, id)));
		const confirmer = this.center === void 0 ? void 0 : makeGuardConfirmer(this.center, this.sessionKey);
		for (const dispose of applyGuards(this.scopedCtx, activeGuards, (id) => {
			this.guardHits.set(id, (this.guardHits.get(id) ?? 0) + 1);
		}, confirmer)) this.disposers.push(dispose);
	}
	installCallStats() {
		if (this.scopeKey === void 0) return;
		this.disposers.push(applyCallStats(this.scopedCtx, (id) => {
			this.callHits.set(id, (this.callHits.get(id) ?? 0) + 1);
		}));
	}
	installCapabilityGate() {
		if (this.scopeKey === void 0) return;
		this.disposers.push(applyCapabilityGate(this.scopedCtx, () => this.store.layered(this.projectKey, this.sessionKey)));
	}
	/**
	* Build the UI projection for this agent: every capability with its per-level
	* stored stance and resolved disabled flag.
	* @param descriptors - this agent's inventory.
	* @returns the projection the composer panel renders.
	*/
	projection(descriptors) {
		return buildProjection(descriptors, this.store.layered(this.projectKey, this.sessionKey), this.projectKey, this.guardHits, this.callHits);
	}
	/** The last pristine inventory this binding captured, or null before its first
	* reconcile. Exposed so the registry can retain it as a cross-lifetime cache:
	* a later read after the agent is disposed still has a capability set to
	* project the persisted overrides against. */
	cachedInventory() {
		return this.lastInventory;
	}
	/** Dispose the current application generation's registrations. */
	dispose() {
		const current = this.disposers;
		this.disposers = [];
		for (const d of current) try {
			d();
		} catch {}
	}
	/**
	* Full teardown when the agent goes away: drop the current registrations and
	* dispose the minted scope fiber. The agent's own scope teardown also unwinds
	* anything registered through it, so this is idempotent with that path.
	*/
	destroy() {
		this.generation += 1;
		this.dispose();
		this.scope?.dispose();
	}
};
//#endregion
//#region lib/types/host/controller.js
/**
* Registry of live agent bindings: one `AgentBinding` per live agent, tracked
* across `agent/created` and `agent/disposed`. The per-agent enforcement
* mechanics live in ./agent-binding.ts; this module only owns the lifecycle map
* and the fan-out reconcile a store commit triggers.
*
* @module dsh-capability-toggle-plugin/host/controller
*/
/**
* Registry of live agent bindings. One per Host activation; agents come and go
* through `agent/created` and `agent/disposed`.
*/
var ControllerRegistry = class {
	store;
	hostCtx;
	center;
	onDrift;
	bindings = /* @__PURE__ */ new Map();
	/**
	* Last-known inventory per session id, surviving the live binding's disposal.
	* Bounded by distinct session ids seen this Host activation (a few per user
	* session); entries are overwritten on each dispose and never grow per turn.
	* Read only by the no-live-agent fallback read.
	*/
	lastKnown = /* @__PURE__ */ new Map();
	/**
	* @param store - the shared override store.
	* @param hostCtx - this plugin's context, whose `skills`/`tools` inject each
	*   binding borrows through a scope minted onto the agent's scope key.
	* @param center - the shared blocking-confirmation registry (optional).
	* @param onDrift - optional warn-once sink handed to every binding's inventory
	*   read, so an unexpected framework shape alarms once instead of silently
	*   yielding an empty capability list.
	*/
	constructor(store, hostCtx, center, onDrift) {
		this.store = store;
		this.hostCtx = hostCtx;
		this.center = center;
		this.onDrift = onDrift;
	}
	/**
	* Track a newly started agent and apply the current decision to it.
	* @param agent - the agent that just started its session.
	* @returns the created binding.
	*/
	async add(agent) {
		const binding = new AgentBinding(this.store, this.hostCtx, agent, this.center, this.onDrift);
		this.bindings.get(agent.session.id)?.destroy();
		this.bindings.set(agent.session.id, binding);
		await binding.reconcile();
		return binding;
	}
	/**
	* Stop tracking an agent and drop its application (and its minted scope).
	* @param agent - the disposed agent.
	*/
	remove(agent) {
		const sessionId = agent.session.id;
		const binding = this.bindings.get(sessionId);
		if (binding === void 0) return;
		if (!binding.owns(agent)) return;
		const inventory = binding.knownInventory;
		if (inventory !== null) this.lastKnown.set(sessionId, {
			inventory,
			projectKey: binding.projectKey
		});
		binding.destroy();
		this.bindings.delete(sessionId);
	}
	/**
	* Look up one live agent's binding.
	* @param sessionId - the session id.
	* @returns the binding, or undefined when the agent is not tracked.
	*/
	get(sessionId) {
		return this.bindings.get(sessionId);
	}
	/**
	* Build a projection for a session that has NO live binding, from its
	* last-known inventory resolved against the CURRENT store. This is what lets
	* the panel show persisted stances after the agent goes idle (an agent's
	* `agent/disposed` drops the live binding every turn). Returns undefined only
	* when this session was never seen live this activation — the caller then
	* answers "no agent" rather than a misleading empty panel. Guard hit tallies
	* are per-agent runtime state that does not survive disposal, so guard rows
	* report zero hits here (their on/off effect is still resolved correctly).
	* @param sessionId - the session id.
	* @returns the fallback projection, or undefined when nothing is cached.
	*/
	fallbackProjection(sessionId) {
		const snapshot = this.lastKnown.get(sessionId);
		if (snapshot === void 0) return void 0;
		const overrides = this.store.layered(snapshot.projectKey, sessionId);
		return buildProjection(snapshot.inventory, overrides, snapshot.projectKey);
	}
	/**
	* The project root a disposed session's project level binds to, from its
	* last-known snapshot. Lets an idle-time (no live binding) project-level
	* write resolve its selector key without a live agent. Returns undefined when
	* this session was never seen live this activation, in which case a
	* project-level write cannot be placed (the caller answers 409/404).
	* @param sessionId - the session id.
	* @returns the cached project key, or undefined when nothing is cached.
	*/
	lastKnownProjectKey(sessionId) {
		return this.lastKnown.get(sessionId)?.projectKey;
	}
	disposeAll() {
		for (const binding of this.bindings.values()) binding.destroy();
		this.bindings.clear();
	}
	/** Re-apply the current decision to every tracked agent (store changed). */
	async reconcileAll() {
		await Promise.all([...this.bindings.values()].map((b) => b.reconcile()));
	}
};
//#endregion
//#region lib/types/host/config.js
/**
* Loader-config schema and stored-document shape for
* dsh-capability-toggle-plugin.
*
* All three override levels live in ONE Loader configuration entry rather than
* a session-log event. This is deliberate: `Session.append()` exposes no way to
* mark a non-surface event `ignorable`, and the persistence read path
* (`assertEventsSupported`) refuses to reconstruct any log carrying an event
* type outside the harness's generated `KNOWN_SESSION_EVENT_TYPES` set — an
* out-of-repo plugin event can never be in that set, so a custom
* `capability/toggle` session event would brick the session on reload. The
* Loader configuration persists across restarts too, so the session level (keyed
* by session id) keeps its survives-reload guarantee without that risk.
*
* Model-visible ⟺ logged still holds: this state never becomes model text on
* its own. Its only model effect — a capability disappearing from the tool
* schema set or the `<available_skills>` catalog — is emitted and logged by
* their owners (the `request/header` snapshot and tool-skill's catalog
* message), which replay recomputes.
*
* @module dsh-capability-toggle-plugin/host/config
*/
/** One capability's stored stance: only the explicit `on`/`off` are persisted. */
const StanceSchema = z.union(["on", "off"]);
/** One level's stored override map (capability id to explicit stance). */
const OverrideMapSchema = z.dict(StanceSchema);
const StoredDocumentSchema = z.object({
	global: OverrideMapSchema.default({}).volatile(),
	projects: z.dict(OverrideMapSchema).default({}).volatile(),
	sessions: z.dict(OverrideMapSchema).default({}).volatile(),
	legacyMigrationCompleted: z.boolean().default(false).volatile()
});
//#endregion
//#region lib/types/host/http.js
/**
* HTTP bridge between the browser panel and the Host controller. Registers two
* routes on the shared web server (same origin as the GUI, so the client uses
* relative fetch and inherits its auth):
*
*   GET  /api/plugin/capability-toggle/state?session=<id>
*        -> { projection: CapabilityToggleProjection } for that session's agent,
*           or 404 when the agent is not live.
*   POST /api/plugin/capability-toggle/set
*        body { session, level, id, state } -> writes one stance and returns the
*           refreshed projection.
*   POST /api/plugin/capability-toggle/set-many
*        body { session, level, ids, state } -> writes the same stance to every
*           listed id in one settings write, and returns the refreshed
*           projection. Backs the panel's bulk-toolbar (enable/disable/clear a
*           filtered tab's visible rows at one level).
*
* This is a Host-owned control channel, not model-visible state, so it lives off
* the session log entirely (see host/config.ts for why the state is not a
* session event). Every write lands in the Loader configuration entry, whose
* volatile-update event drives reconciliation for every live agent.
*
* @module dsh-capability-toggle-plugin/host/http
*/
/** URL path prefix this plugin claims on the web server. */
const ROUTE_PREFIX = "/api/plugin/capability-toggle";
/**
* Install the HTTP routes. Returns the composed disposer.
* @param ctx - the Host context (must inject `webServer`).
* @param store - the shared override store.
* @param registry - the live-agent controller registry.
* @returns a disposer that unregisters every route.
*/
function installHttp(ctx, store, registry, center) {
	const auth = resolveAuth(ctx);
	const liveStreams = /* @__PURE__ */ new Set();
	const disposeState = ctx.webServer.register({
		kind: "exact",
		path: `${ROUTE_PREFIX}/state`,
		handler: (req, res) => guard(ctx, res, () => handleMethod(req, res, "GET", () => handleState(req, res, registry, auth)))
	});
	const disposeSet = ctx.webServer.register({
		kind: "exact",
		path: `${ROUTE_PREFIX}/set`,
		handler: (req, res) => guard(ctx, res, () => handleMethod(req, res, "POST", () => handleSet(req, res, store, registry, auth)))
	});
	const disposeSetMany = ctx.webServer.register({
		kind: "exact",
		path: `${ROUTE_PREFIX}/set-many`,
		handler: (req, res) => guard(ctx, res, async () => handleMethod(req, res, "POST", () => handleSetMany(req, res, store, registry, auth)))
	});
	const disposeConfirmStream = ctx.webServer.register({
		kind: "exact",
		path: `${ROUTE_PREFIX}/confirm/stream`,
		handler: (req, res) => guard(ctx, res, async () => {
			await handleMethod(req, res, "GET", async () => {
				let teardown;
				teardown = handleConfirmStream(req, res, center, auth, () => {
					if (teardown !== void 0) liveStreams.delete(teardown);
				});
				if (teardown !== void 0) liveStreams.add(teardown);
			});
		})
	});
	const disposeConfirmRespond = ctx.webServer.register({
		kind: "exact",
		path: `${ROUTE_PREFIX}/confirm/respond`,
		handler: (req, res) => guard(ctx, res, async () => {
			await handleMethod(req, res, "POST", async () => {
				await handleConfirmRespond(req, res, center, auth);
			});
		})
	});
	return () => {
		disposeConfirmRespond();
		disposeConfirmStream();
		for (const teardown of [...liveStreams]) teardown();
		liveStreams.clear();
		disposeSetMany();
		disposeSet();
		disposeState();
	};
}
function resolveAuth(ctx) {
	return (req) => {
		try {
			const connection = ctx.get("connection");
			const reject = connection?.requestRejection;
			if (connection === void 0 || typeof reject !== "function") return 503;
			const result = reject.call(connection, req);
			if (result === void 0) return void 0;
			if (typeof result === "number") return result;
			return 503;
		} catch {
			return 503;
		}
	};
}
/**
* Run a handler and never let it throw to the web server's fallback (which
* swallows the error into an empty 400 with no body). On any error, log it and
* answer 500 with the message — the panel treats a non-200 as unavailable, so
* surfacing the cause here is the only way to see it.
* @param ctx - the Host context, for logging.
* @param res - the response to complete on failure.
* @param run - the wrapped handler.
*/
async function guard(ctx, res, run) {
	try {
		await run();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.logger.warn(`capability-toggle route failed: ${message}`);
		if (!res.headersSent) sendJson(res, 500, { error: message });
		else res.end();
	}
}
async function handleMethod(req, res, expected, run) {
	if (req.method !== expected) {
		res.writeHead(405, { allow: expected });
		res.end();
		return;
	}
	await run();
}
/** Answer the projection read for one session's live agent. */
async function handleState(req, res, registry, auth) {
	const rejection = auth(req);
	if (rejection !== void 0) {
		sendJson(res, rejection, { error: "unauthorized" });
		return;
	}
	const session = new URL(req.url ?? "", "http://localhost").searchParams.get("session");
	if (session === null || session === "") {
		sendJson(res, 400, { error: "missing session parameter" });
		return;
	}
	const binding = registry.get(session);
	if (binding === void 0) {
		const fallback = registry.fallbackProjection(session);
		if (fallback === void 0) {
			sendJson(res, 404, { error: "no live agent for session" });
			return;
		}
		sendJson(res, 200, { projection: fallback });
		return;
	}
	const descriptors = await binding.inventory();
	sendJson(res, 200, { projection: binding.projection(descriptors) });
}
/** Apply one stance write, then return the refreshed projection. */
async function handleSet(req, res, store, registry, auth) {
	const rejection = auth(req);
	if (rejection !== void 0) {
		sendJson(res, rejection, { error: "unauthorized" });
		return;
	}
	if (!isJsonContentType(req)) {
		sendJson(res, 415, { error: "content-type must be application/json" });
		return;
	}
	let body;
	try {
		body = parseSetBody(await readBody(req));
	} catch (error) {
		sendJson(res, 400, { error: error instanceof Error ? error.message : "invalid body" });
		return;
	}
	const resolved = resolveWriteTarget(body.session, body.level, registry);
	if (resolved === null) {
		sendJson(res, 409, { error: "this session has no project root; use session or global level" });
		return;
	}
	await store.set(resolved.selector, body.id, body.state);
	await respondWithProjection(res, body.session, resolved.binding, registry);
}
/** Apply the same stance to every listed id in one write, then return the refreshed projection. */
async function handleSetMany(req, res, store, registry, auth) {
	const rejection = auth(req);
	if (rejection !== void 0) {
		sendJson(res, rejection, { error: "unauthorized" });
		return;
	}
	if (!isJsonContentType(req)) {
		sendJson(res, 415, { error: "content-type must be application/json" });
		return;
	}
	let body;
	try {
		body = parseSetManyBody(await readBody(req));
	} catch (error) {
		sendJson(res, 400, { error: error instanceof Error ? error.message : "invalid body" });
		return;
	}
	const resolved = resolveWriteTarget(body.session, body.level, registry);
	if (resolved === null) {
		sendJson(res, 409, { error: "this session has no project root; use session or global level" });
		return;
	}
	await store.setMany(resolved.selector, body.ids, body.state);
	await respondWithProjection(res, body.session, resolved.binding, registry);
}
/**
* Open one browser's SSE confirmation stream; the center writes `confirm`
* pushes into it for the subscription's lifetime. The 15s keep-alive comment
* frame keeps intermediaries from dropping an idle stream.
*/
function handleConfirmStream(req, res, center, auth, onTeardown) {
	const rejection = auth(req);
	if (rejection !== void 0) {
		sendJson(res, rejection, { error: "unauthorized" });
		return;
	}
	if (!isSameOrigin(req)) {
		sendJson(res, 403, { error: "cross-origin SSE is not allowed" });
		return;
	}
	const session = new URL(req.url ?? "", "http://localhost").searchParams.get("session");
	if (session === null || session === "") {
		sendJson(res, 400, { error: "missing session parameter" });
		return;
	}
	res.writeHead(200, {
		"content-type": "text/event-stream; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff",
		"connection": "keep-alive"
	});
	res.flushHeaders();
	let torn = false;
	let off = () => {};
	const keepAlive = setInterval(() => {
		try {
			if (!res.write(": keep-alive\n\n")) clearInterval(keepAlive);
		} catch {
			teardown();
		}
	}, 15e3);
	keepAlive.unref?.();
	const teardown = () => {
		if (torn) return;
		torn = true;
		clearInterval(keepAlive);
		off();
		req.removeListener("aborted", teardown);
		req.removeListener("error", teardown);
		res.removeListener("close", teardown);
		res.removeListener("error", teardown);
		res.removeListener("finish", teardown);
		if (!res.writableEnded) res.end();
		onTeardown?.();
	};
	off = center.subscribe(session, {
		write: (chunk) => res.write(chunk),
		end: () => teardown()
	});
	req.once("aborted", teardown);
	req.once("error", teardown);
	res.once("close", teardown);
	res.once("error", teardown);
	res.once("finish", teardown);
	return teardown;
}
async function handleConfirmRespond(req, res, center, auth) {
	const rejection = auth(req);
	if (rejection !== void 0) {
		sendJson(res, rejection, { error: "unauthorized" });
		return;
	}
	if (!isJsonContentType(req)) {
		sendJson(res, 415, { error: "content-type must be application/json" });
		return;
	}
	let body;
	try {
		body = parseRespondBody(await readBody(req));
	} catch (error) {
		sendJson(res, 400, { error: error instanceof Error ? error.message : "invalid body" });
		return;
	}
	const settled = center.respond(body.session, body.id, body.decision);
	sendJson(res, settled ? 200 : 410, { settled });
}
/**
* Resolve one write's level selector against the session's live or last-known
* project key, shared by {@link handleSet} and {@link handleSetMany} so both
* apply the exact same project-availability rule.
* @param session - the session id the write addresses.
* @param level - the requested write level.
* @param registry - the live-agent controller registry.
* @returns the selector and the session's live binding (if any), or `null`
*   when a project-level write was requested with no resolvable project root.
*/
function resolveWriteTarget(session, level, registry) {
	const binding = registry.get(session);
	const projectKey = binding?.projectKey ?? registry.lastKnownProjectKey(session);
	if (level === "project" && (projectKey === void 0 || projectKey === "")) return null;
	return {
		selector: level === "global" ? { level: "global" } : level === "project" ? {
			level: "project",
			key: projectKey
		} : {
			level: "session",
			key: session
		},
		binding
	};
}
/**
* Answer a write with the refreshed projection, shared by {@link handleSet}
* and {@link handleSetMany} once the store write itself has completed.
* @param res - the response to complete.
* @param session - the session id the write addressed.
* @param binding - the session's live binding, or undefined when idle.
* @param registry - the live-agent controller registry.
*/
async function respondWithProjection(res, session, binding, registry) {
	if (binding !== void 0) {
		await binding.reconcile();
		const descriptors = await binding.inventory();
		sendJson(res, 200, { projection: binding.projection(descriptors) });
		return;
	}
	const fallback = registry.fallbackProjection(session);
	if (fallback === void 0) {
		sendJson(res, 404, { error: "no live agent for session" });
		return;
	}
	sendJson(res, 200, { projection: fallback });
}
/**
* Validate an unknown parsed body into a SetBody, throwing on any deviation.
* Exported (not a route-private helper) so its rejection/accept paths can be
* unit-tested without a live `IncomingMessage`/`ServerResponse` pair.
*/
function parseSetBody(raw) {
	if (raw === null || typeof raw !== "object") throw new Error("body must be an object");
	const b = raw;
	const session = b["session"];
	const level = b["level"];
	const id = b["id"];
	const state = b["state"];
	if (typeof session !== "string" || session === "") throw new Error("session must be a non-empty string");
	if (typeof level !== "string" || !WRITABLE_LEVELS.includes(level)) throw new Error("level must be one of session, project, global");
	if (typeof id !== "string" || id === "") throw new Error("id must be a non-empty string");
	if (state !== "on" && state !== "off" && state !== "inherit") throw new Error("state must be on, off, or inherit");
	return {
		session,
		level,
		id,
		state
	};
}
/**
* Validate an unknown parsed body into a SetManyBody, throwing on any
* deviation. Exported for the same unit-testability reason as
* {@link parseSetBody}.
*/
function parseSetManyBody(raw) {
	if (raw === null || typeof raw !== "object") throw new Error("body must be an object");
	const b = raw;
	const session = b["session"];
	const level = b["level"];
	const ids = b["ids"];
	const state = b["state"];
	if (typeof session !== "string" || session === "") throw new Error("session must be a non-empty string");
	if (typeof level !== "string" || !WRITABLE_LEVELS.includes(level)) throw new Error("level must be one of session, project, global");
	if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id === "")) throw new Error("ids must be an array of non-empty strings");
	if (state !== "on" && state !== "off" && state !== "inherit") throw new Error("state must be on, off, or inherit");
	return {
		session,
		level,
		ids,
		state
	};
}
/**
* Validate an unknown parsed body into a RespondBody, throwing on any
* deviation. Exported for the same unit-testability reason as
* {@link parseSetBody}.
*/
function parseRespondBody(raw) {
	if (raw === null || typeof raw !== "object") throw new Error("body must be an object");
	const b = raw;
	const session = b["session"];
	const id = b["id"];
	const decision = b["decision"];
	if (typeof session !== "string" || session === "") throw new Error("session must be a non-empty string");
	if (typeof id !== "string" || id === "") throw new Error("id must be a non-empty string");
	if (decision !== "allow" && decision !== "deny") throw new Error("decision must be allow or deny");
	return {
		session,
		id,
		decision
	};
}
/** Read a request body as UTF-8 text, bounded to a sane size. */
async function readBody(req) {
	const chunks = [];
	let total = 0;
	const limit = 262144;
	for await (const chunk of req) {
		const buf = chunk;
		total += buf.length;
		if (total > limit) throw new Error("request body too large");
		chunks.push(buf);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim() === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new Error("body is not valid JSON");
	}
}
/** Send a JSON response with the given status. */
function sendJson(res, status, body) {
	const text = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(text);
}
function isJsonContentType(req) {
	const header = req.headers["content-type"];
	if (typeof header !== "string") return false;
	return header.split(";", 1)[0].trim().toLowerCase() === "application/json";
}
/**
* Same-origin check for SSE. EventSource sends no Origin or Sec-Fetch-Site for
* a same-origin GET, so when they are absent the Host header (always sent) is
* what verifies the origin.
*/
function isSameOrigin(req) {
	const host = req.headers["host"];
	if (typeof host !== "string") return false;
	const origin = req.headers["origin"];
	const secFetchSite = req.headers["sec-fetch-site"];
	if (typeof secFetchSite === "string") {
		if (secFetchSite === "cross-site" || secFetchSite === "same-site") return false;
	}
	if (typeof origin === "string") try {
		const originUrl = new URL(origin);
		return originUrl.protocol === "http:" && originUrl.host === host;
	} catch {
		return false;
	}
	return true;
}
//#endregion
//#region lib/types/index.js
/**
* Host (Node) half of dsh-capability-toggle-plugin.
*
* Lets a user switch off individual skills, MCP server groups, and plain tools
* at three levels — session, project, and global — from a panel in the composer
* tool row. A switched-off capability disappears from the model's tool schema
* set / skill catalog on the next agent step and is hard-refused if the model
* still attempts it, so the effect is enforced, not merely hidden.
*
* Composition:
*   - OverrideStore        durable three-level state in the Loader config entry.
*   - ControllerRegistry   per-agent enforcement on the tool and skill seams.
*   - installHttp          the browser panel's read/write channel.
*
* Enforcement is re-applied whenever the store commits (any level, any client)
* and whenever an agent starts; it is dropped when an agent is disposed.
*
* @module dsh-capability-toggle-plugin
*/
/** Cordis plugin name used by loader diagnostics. */
const name = "dsh-capability-toggle-plugin";
/**
* Required services. `configEditor` backs the durable state, `tools` and `skills`
* are the enforced seams, `systemPrompt` carries the tool-guidance section
* shadow that accompanies a disabled tool, `agents` is unused directly but its
* lifecycle events drive tracking, and `webServer` carries the browser panel
* channel.
*/
const inject = [
	"agents",
	"configEditor",
	"tools",
	"skills",
	"systemPrompt",
	"webServer",
	"connection"
];
/**
* Host plugin body. Every contribution is an effect, so plugin unload (or HMR
* hot-swap) tears down the routes and every per-agent application.
* @param ctx - the Host root context.
*/
const Config = StoredDocumentSchema;
function apply(ctx, config) {
	emitContractBanner(ctx);
	checkRequiredServices(ctx);
	const onDrift = makeWarnOnce(ctx);
	const legacy = readLegacyOverridesSyncResult();
	if (legacy.status === "invalid") ctx.logger.warn("capability-toggle could not read valid legacy overrides; continuing without legacy migration.");
	const store = new OverrideStore(ctx, config, legacy.status === "available" ? legacy.value : void 0);
	const center = new ConfirmationCenter();
	const registry = new ControllerRegistry(store, ctx, center, onDrift);
	ctx.effect(() => installHttp(ctx, store, registry, center), "capability-toggle: http routes");
	ctx.effect(() => () => registry.disposeAll(), "capability-toggle: bindings");
	ctx.effect(() => () => center.dispose(), "capability-toggle: confirmation center");
	const bindAgent = async (agent, source) => {
		try {
			await registry.add(agent);
		} catch (error) {
			ctx.logger.warn(`capability-toggle failed to bind ${source}: ${messageOf(error)}`);
		}
	};
	for (const agent of ctx.agents.list()) bindAgent(agent, "existing agent");
	store.migrateLegacy().catch((error) => {
		ctx.logger.warn(`capability-toggle failed to migrate legacy overrides: ${messageOf(error)}`);
	});
	ctx.on("agent/created", ({ agent }) => bindAgent(agent, "created agent"));
	ctx.on("loader/volatile-update", () => {
		registry.reconcileAll().catch((error) => {
			ctx.logger.warn(`capability-toggle failed to reconcile volatile override update: ${messageOf(error)}`);
		});
	});
	ctx.on("agent/disposed", ({ agent }) => {
		registry.remove(agent);
	});
}
/** Extract a log-safe message from an unknown error. */
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
export { Config, apply, inject, name };

//# sourceMappingURL=index.js.map