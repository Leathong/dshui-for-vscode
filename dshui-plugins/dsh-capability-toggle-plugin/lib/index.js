import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { createScope, scopeOf } from "@deepseek-ai/dsh-scope";
import { randomUUID } from "node:crypto";
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/core/util.js
function getEnumValues(entries) {
	const numericValues = Object.values(entries).filter((v) => typeof v === "number");
	return Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
}
function joinValues(array, separator = "|") {
	return array.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
	if (typeof value === "bigint") return value.toString();
	return value;
}
function nullish(input) {
	return input === null || input === void 0;
}
function cleanRegex(source) {
	const start = source.startsWith("^") ? 1 : 0;
	const end = source.endsWith("$") ? source.length - 1 : source.length;
	return source.slice(start, end);
}
function assignProp(target, prop, value) {
	Object.defineProperty(target, prop, {
		value,
		writable: true,
		enumerable: true,
		configurable: true
	});
}
function mergeDefs(...defs) {
	const mergedDescriptors = {};
	for (const def of defs) {
		const descriptors = Object.getOwnPropertyDescriptors(def);
		Object.assign(mergedDescriptors, descriptors);
	}
	return Object.defineProperties({}, mergedDescriptors);
}
function slugify(input) {
	return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
const captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function isObject(data) {
	return typeof data === "object" && data !== null && !Array.isArray(data);
}
function isPlainObject(o) {
	if (isObject(o) === false) return false;
	const ctor = o.constructor;
	if (ctor === void 0) return true;
	if (typeof ctor !== "function") return true;
	const prot = ctor.prototype;
	if (isObject(prot) === false) return false;
	if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) return false;
	return true;
}
function shallowClone(o) {
	if (isPlainObject(o)) return { ...o };
	if (Array.isArray(o)) return [...o];
	if (o instanceof Map) return new Map(o);
	if (o instanceof Set) return new Set(o);
	return o;
}
const propertyKeyTypes = /* @__PURE__*/ new Set([
	"string",
	"number",
	"symbol"
]);
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
	const cl = new inst._zod.constr(def ?? inst._zod.def);
	if (!def || params?.parent) cl._zod.parent = inst;
	return cl;
}
function normalizeParams(_params) {
	const params = _params;
	if (!params) return {};
	if (typeof params === "string") return { error: () => params };
	if (params?.message !== void 0) {
		if (params?.error !== void 0) throw new Error("Cannot specify both `message` and `error` params");
		params.error = params.message;
	}
	delete params.message;
	if (typeof params.error === "string") return {
		...params,
		error: () => params.error
	};
	return params;
}
function stringifyPrimitive(value) {
	if (typeof value === "bigint") return value.toString() + "n";
	if (typeof value === "string") return `"${value}"`;
	return `${value}`;
}
function aborted(x, startIndex = 0) {
	if (x.aborted === true) return true;
	for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue !== true) return true;
	return false;
}
function explicitlyAborted(x, startIndex = 0) {
	if (x.aborted === true) return true;
	for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue === false) return true;
	return false;
}
function prefixIssues(path, issues) {
	return issues.map((iss) => {
		var _a;
		(_a = iss).path ?? (_a.path = []);
		iss.path.unshift(path);
		return iss;
	});
}
function unwrapMessage(message) {
	return typeof message === "string" ? message : message?.message;
}
function attachSchema(issues, start, inst) {
	var _a;
	for (let i = start; i < issues.length; i++) (_a = issues[i]).schema ?? (_a.schema = inst);
}
function finalizeIssue(iss, ctx, config) {
	var _a;
	const traits = iss.inst?._zod?.traits;
	if (traits?.has("$ZodType")) {
		if (traits.has("$ZodCheck")) (_a = iss).schema ?? (_a.schema = iss.inst);
		else iss.schema = iss.inst;
	}
	const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : void 0;
	const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
	const { inst: _inst, schema: _schema, continue: _continue, input: _input, ...rest } = iss;
	rest.path ?? (rest.path = []);
	rest.message = message;
	if (ctx?.reportInput) rest.input = _input;
	return rest;
}
const highSurrogate = /[\uD800-\uDBFF]/;
function codePointLength(str) {
	const units = str.length;
	if (!highSurrogate.test(str)) return units;
	let count = units;
	for (let i = 0; i < units - 1; i++) if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
		count--;
		i++;
	}
	return count;
}
function getLengthableOrigin(input) {
	if (Array.isArray(input)) return "array";
	if (typeof input === "string") return "string";
	return "unknown";
}
function parsedType(data) {
	const t = typeof data;
	switch (t) {
		case "number": return Number.isNaN(data) ? "nan" : "number";
		case "object": {
			if (data === null) return "null";
			if (Array.isArray(data)) return "array";
			const obj = data;
			if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) return obj.constructor.name;
		}
	}
	return t;
}
function issue(...args) {
	const [iss, input, inst] = args;
	if (typeof iss === "string") return {
		message: iss,
		code: "custom",
		input,
		inst
	};
	return { ...iss };
}
/**
* Installs a trait's members on its prototype. Each value builds that member for the instance on first read; the built value shadows the accessor as an own property, so a detached `const { parse } = schema` keeps working.
*
* Call this from a `proto` initializer, which runs once per prototype — never per instance.
*/
function members(proto, table) {
	for (const key in table) {
		const desc = Object.getOwnPropertyDescriptor(table, key);
		if (desc.get) Object.defineProperty(proto, key, {
			...desc,
			enumerable: false
		});
		else defineBound(proto, key, desc.value);
	}
}
/** Shadows a prototype member with an own value, so a getter that builds from the instance runs once. */
function own(inst, key, value, enumerable = true) {
	Object.defineProperty(inst, key, {
		configurable: true,
		writable: true,
		enumerable,
		value
	});
	return value;
}
/** Like {@link own}, for a member that was never an own data property and has to stay out of `Object.keys`. */
function hide(inst, key, value) {
	return own(inst, key, value, false);
}
function defineBound(proto, key, fn) {
	Object.defineProperty(proto, key, {
		configurable: true,
		get() {
			return this == null ? fn : own(this, key, fn.bind(this));
		},
		set(value) {
			own(this, key, value);
		}
	});
}
let installing;
let broke = false;
const breaker = {
	configurable: true,
	get() {
		broke = true;
	}
};
/**
* Installs a lazily-derived internal on the `_zod` prototype of `inst`'s
* constructor, computed from the internals object itself and cached there on
* first read. One accessor per constructor rather than one per instance.
*/
function defineLazyInternal(inst, key, compute) {
	const proto = Object.getPrototypeOf(inst._zod);
	if (key in proto && installing !== inst._zod) {
		installing = void 0;
		return;
	}
	installing = inst._zod;
	Object.defineProperty(proto, key, {
		configurable: true,
		get() {
			Object.defineProperty(this, key, breaker);
			const outer = broke;
			broke = false;
			try {
				const value = compute(this);
				if (broke) delete this[key];
				else Object.defineProperty(this, key, {
					configurable: true,
					writable: true,
					value
				});
				broke = broke || outer;
				return value;
			} catch (err) {
				delete this[key];
				broke = broke || outer;
				throw err;
			}
		},
		set(value) {
			Object.defineProperty(this, key, {
				configurable: true,
				writable: true,
				value
			});
		}
	});
}
/** Marks the thunk `_catch` synthesises for a constant catch value. `Function.length` cannot tell that thunk from a user callback — rest and defaulted parameters both report arity 0 — and a user callback reads `ctx.error`, whose issues only finalize correctly against the caller's per-parse error map. Provenance can say what arity cannot. A plain string key rather than `Symbol.for`, whose call at module scope no bundler can prove pure — the same shape that anchored `urlCanParse` into every build. */
const CONSTANT_CATCH = "~constantCatch";
/** Wraps a constant catch value in a thunk tagged with {@link CONSTANT_CATCH}. */
function constantCatch(value) {
	const fn = () => value;
	fn[CONSTANT_CATCH] = true;
	return fn;
}
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/core/core.js
var _a$1;
const _zodDesc$1 = {
	value: void 0,
	enumerable: false
};
let _E = "captureStackTrace" in Error ? Error : null;
function newError(Definition) {
	const E = _E;
	if (E) {
		const saved = E.stackTraceLimit;
		if (typeof saved === "number") {
			try {
				E.stackTraceLimit = 0;
			} catch {
				_E = null;
				return new Definition();
			}
			try {
				return new Definition();
			} finally {
				E.stackTraceLimit = saved;
			}
		}
	}
	return new Definition();
}
function $constructor(name, initializer, proto, params) {
	const zodProto = {};
	function Internals(def) {
		this.def = def;
		this.constr = _;
		this.traits = /* @__PURE__ */ new Set();
	}
	Internals.prototype = zodProto;
	const protoMembers = proto;
	const initialized = protoMembers && /* @__PURE__ */ new WeakSet();
	function init(inst, def) {
		if (!inst._zod) {
			_zodDesc$1.value = new Internals(def);
			try {
				Object.defineProperty(inst, "_zod", _zodDesc$1);
			} finally {
				_zodDesc$1.value = void 0;
			}
		}
		if (inst._zod.traits.has(name)) return;
		inst._zod.traits.add(name);
		initializer(inst, def);
		if (initialized) {
			const own = Object.getPrototypeOf(inst);
			const ctorProto = inst._zod.constr.prototype;
			let up = own;
			while (up && up !== ctorProto) up = Object.getPrototypeOf(up);
			const target = up ?? own;
			if (!initialized.has(target)) {
				initialized.add(target);
				members(target, protoMembers);
			}
		}
		const proto = _.prototype;
		for (const k in proto) {
			if (!Object.prototype.hasOwnProperty.call(proto, k)) continue;
			if (!(k in inst)) inst[k] = proto[k].bind(inst);
		}
	}
	const Parent = params?.Parent ?? Object;
	class Definition extends Parent {}
	Object.defineProperty(Definition, "name", { value: name });
	function _(def) {
		const inst = params?.Parent ? newError(Definition) : this;
		init(inst, def);
		const deferred = inst._zod.deferred;
		if (deferred) {
			for (const fn of deferred) fn();
			inst._zod.deferred = void 0;
		}
		const pp = globalThis.__zod_globalConfig?.postProcessor;
		if (pp) pp(inst);
		return inst;
	}
	Object.defineProperty(_, "init", { value: init });
	Object.defineProperty(_, Symbol.hasInstance, { value: (inst) => {
		if (params?.Parent && inst instanceof params.Parent) return true;
		return inst?._zod?.traits?.has(name);
	} });
	Object.defineProperty(_, "name", { value: name });
	return _;
}
var $ZodAsyncError = class extends Error {
	constructor() {
		super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
	}
};
var $ZodEncodeError = class extends Error {
	constructor(name) {
		super(`Encountered unidirectional transform during encode: ${name}`);
		this.name = "ZodEncodeError";
	}
};
(_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
const globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
	if (newConfig) Object.assign(globalConfig, newConfig);
	return globalConfig;
}
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/core/errors.js
function _getMessage() {
	const internals = this._zod;
	internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
	return internals.message;
}
function _setMessage(value) {
	this._zod.message = value;
}
const _messageDesc = {
	get: _getMessage,
	set: _setMessage,
	enumerable: true,
	configurable: true
};
const _zodDesc = {
	value: void 0,
	enumerable: false
};
const _issuesDesc = {
	value: void 0,
	enumerable: false
};
const _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
const initializer$1 = (inst, def) => {
	inst.name = "$ZodError";
	_zodDesc.value = inst._zod;
	Object.defineProperty(inst, "_zod", _zodDesc);
	_issuesDesc.value = def;
	Object.defineProperty(inst, "issues", _issuesDesc);
	_zodDesc.value = void 0;
	_issuesDesc.value = void 0;
	Object.defineProperty(inst, "message", _messageDesc);
	const proto = Object.getPrototypeOf(inst);
	if (!_installedToString.has(proto)) {
		_installedToString.add(proto);
		Object.defineProperty(proto, "toString", {
			configurable: true,
			enumerable: false,
			get() {
				const value = () => this.message;
				Object.defineProperty(this, "toString", {
					value,
					configurable: true,
					writable: true
				});
				return value;
			},
			set(value) {
				Object.defineProperty(this, "toString", {
					value,
					configurable: true,
					writable: true
				});
			}
		});
	}
};
const $ZodError = $constructor("$ZodError", initializer$1);
const $ZodRealError = $constructor("$ZodError", initializer$1, void 0, { Parent: Error });
/** Get-or-create `obj[key]` as an own data property. A path segment naming an inherited member
* ("toString", "constructor") would otherwise read through to the prototype, and assigning
* "__proto__" would hit the setter instead of creating a key. */
function node(obj, key, make) {
	if (!Object.prototype.hasOwnProperty.call(obj, key)) {
		if (key === "__proto__") Object.defineProperty(obj, key, {
			value: make(),
			writable: true,
			enumerable: true,
			configurable: true
		});
		else obj[key] = make();
	}
	return obj[key];
}
function flattenError(error, mapper = (issue) => issue.message) {
	const fieldErrors = {};
	const formErrors = [];
	for (const sub of error.issues) if (sub.path.length > 0) node(fieldErrors, sub.path[0], () => []).push(mapper(sub));
	else formErrors.push(mapper(sub));
	return {
		formErrors,
		fieldErrors
	};
}
function formatError(error, mapper = (issue) => issue.message) {
	const fieldErrors = { _errors: [] };
	const processError = (error, path = []) => {
		for (const issue of error.issues) if (issue.code === "invalid_union" && issue.errors.length) issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
		else if (issue.code === "invalid_key") processError({ issues: issue.issues }, [...path, ...issue.path]);
		else if (issue.code === "invalid_element") processError({ issues: issue.issues }, [...path, ...issue.path]);
		else {
			const fullpath = [...path, ...issue.path];
			if (fullpath.length === 0) fieldErrors._errors.push(mapper(issue));
			else {
				let curr = fieldErrors;
				let i = 0;
				while (i < fullpath.length) {
					const el = fullpath[i];
					const terminal = i === fullpath.length - 1;
					if (el === "_errors") {
						if (terminal) curr._errors.push(mapper(issue));
						i++;
						continue;
					}
					if (!Object.prototype.hasOwnProperty.call(curr, el)) Object.defineProperty(curr, el, {
						value: { _errors: [] },
						enumerable: true,
						writable: true,
						configurable: true
					});
					const node = curr[el];
					if (terminal) node._errors.push(mapper(issue));
					curr = node;
					i++;
				}
			}
		}
	};
	processError(error);
	return fieldErrors;
}
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/core/parse.js
function finalizeParams(callee, params) {
	return {
		callee: params?.callee ?? callee,
		Err: params?.Err
	};
}
const _parse = (_Err) => {
	const fn = (schema, value, _ctx, _params) => {
		const ctx = _ctx ? {
			..._ctx,
			async: false
		} : { async: false };
		const result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) throw new $ZodAsyncError();
		if (result.issues.length) {
			const e = new ((_params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
			captureStackTrace(e, _params?.callee ?? fn);
			throw e;
		}
		return result.value;
	};
	return fn;
};
const _parseAsync = (_Err) => {
	const fn = async (schema, value, _ctx, params) => {
		const ctx = _ctx ? {
			..._ctx,
			async: true
		} : { async: true };
		let result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) result = await result;
		if (result.issues.length) {
			const e = new ((params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
			captureStackTrace(e, params?.callee ?? fn);
			throw e;
		}
		return result.value;
	};
	return fn;
};
const _safeParse = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: false
	} : { async: false };
	const result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) throw new $ZodAsyncError();
	return result.issues.length ? {
		success: false,
		error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	} : {
		success: true,
		data: result.value
	};
};
const safeParse$1 = /* @__PURE__*/ _safeParse($ZodRealError);
const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: true
	} : { async: true };
	let result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) result = await result;
	return result.issues.length ? {
		success: false,
		error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	} : {
		success: true,
		data: result.value
	};
};
const safeParseAsync$1 = /* @__PURE__*/ _safeParseAsync($ZodRealError);
const _encode = (_Err) => {
	const parse = _parse(_Err);
	const fn = (schema, value, _ctx, _params) => {
		const ctx = _ctx ? {
			..._ctx,
			direction: "backward"
		} : { direction: "backward" };
		return parse(schema, value, ctx, finalizeParams(fn, _params));
	};
	return fn;
};
const _decode = (_Err) => {
	const parse = _parse(_Err);
	const fn = (schema, value, _ctx, _params) => {
		return parse(schema, value, _ctx, finalizeParams(fn, _params));
	};
	return fn;
};
const _encodeAsync = (_Err) => {
	const parseAsync = _parseAsync(_Err);
	const fn = async (schema, value, _ctx, _params) => {
		const ctx = _ctx ? {
			..._ctx,
			direction: "backward"
		} : { direction: "backward" };
		return await parseAsync(schema, value, ctx, finalizeParams(fn, _params));
	};
	return fn;
};
const _decodeAsync = (_Err) => {
	const parseAsync = _parseAsync(_Err);
	const fn = async (schema, value, _ctx, _params) => {
		return await parseAsync(schema, value, _ctx, finalizeParams(fn, _params));
	};
	return fn;
};
const _safeEncode = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _safeParse(_Err)(schema, value, ctx);
};
const _safeDecode = (_Err) => (schema, value, _ctx) => {
	return _safeParse(_Err)(schema, value, _ctx);
};
const _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _safeParseAsync(_Err)(schema, value, ctx);
};
const _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
	return _safeParseAsync(_Err)(schema, value, _ctx);
};
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/core/regexes.js
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link cuid2} instead.
* See https://github.com/paralleldrive/cuid.
*/
const cuid = /^[cC][0-9a-z]{6,}$/;
const cuid2 = /^[0-9a-z]+$/;
const ulid = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/;
const xid = /^[0-9a-vA-V]{20}$/;
const ksuid = /^[A-Za-z0-9]{27}$/;
const nanoid = /^[a-zA-Z0-9_-]{21}$/;
function nanoidOfLength(length) {
	return new RegExp(`^[a-zA-Z0-9_-]{${length}}$`);
}
/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
const duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
const guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
/** Returns a regex for validating an RFC 9562/4122 UUID.
*
* @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
const uuid = (version) => {
	if (!version) return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
	return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
/** Practical email validation */
const email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
const _emoji$1 = `^[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$`;
function emoji() {
	return new RegExp(_emoji$1, "u");
}
const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
const cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
const cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
const base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
const base64url = /^[A-Za-z0-9_-]*$/;
const httpProtocol = /^https?$/;
const e164 = /^\+[1-9]\d{6,14}$/;
const dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
/** Anchors a pattern source. The interpolation lives here rather than at the call site because
* esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it
* will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */
function anchor(source) {
	return new RegExp(`^${source}$`);
}
const date = /*@__PURE__*/ anchor(dateSource);
function timeSource(args) {
	const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
	return typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : args.seconds ? `${hhmm}:[0-5]\\d(?:\\.\\d+)?` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
}
function time(args) {
	return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
	const opts = ["Z"];
	if (args.offset) opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
	const qualified = `${timeSource({
		precision: args.precision,
		seconds: true
	})}(?:${opts.join("|")})`;
	const timeRegex = args.local ? `${qualified}|${timeSource({ precision: args.precision })}` : qualified;
	return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
const string$1 = (params) => {
	const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
	return new RegExp(`^${regex}$`);
};
const integer = /^-?\d+$/;
const number = /^-?\d+(?:\.\d+)?$/;
const lowercase = /^[^A-Z]*$/;
const uppercase = /^[^a-z]*$/;
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/core/checks.js
const $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
	var _a;
	inst._zod ?? (inst._zod = {});
	inst._zod.def = def;
	(_a = inst._zod).onattach ?? (_a.onattach = []);
});
/** Default `when` for length-based checks: run only on non-nullish values with a `length`. */
const _whenHasLength = (payload) => {
	const val = payload.value;
	return !nullish(val) && val.length !== void 0;
};
const $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
	inst._zod.onattach.push((inst) => {
		const curr = inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
		if (def.maximum < curr) inst._zod.bag.maximum = def.maximum;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		const units = input.length;
		if ((typeof input === "string" && units > def.maximum ? codePointLength(input) : units) <= def.maximum) return;
		const origin = getLengthableOrigin(input);
		payload.issues.push({
			origin,
			code: "too_big",
			maximum: def.maximum,
			inclusive: true,
			input,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
	inst._zod.onattach.push((inst) => {
		const curr = inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
		if (def.minimum > curr) inst._zod.bag.minimum = def.minimum;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		const units = input.length;
		if ((typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units) >= def.minimum) return;
		const origin = getLengthableOrigin(input);
		payload.issues.push({
			origin,
			code: "too_small",
			minimum: def.minimum,
			inclusive: true,
			input,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.minimum = def.length;
		bag.maximum = def.length;
		bag.length = def.length;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		const units = input.length;
		const length = typeof input === "string" && units >= def.length && units <= def.length * 2 ? codePointLength(input) : units;
		if (length === def.length) return;
		const origin = getLengthableOrigin(input);
		const tooBig = length > def.length;
		payload.issues.push({
			origin,
			...tooBig ? {
				code: "too_big",
				maximum: def.length
			} : {
				code: "too_small",
				minimum: def.length
			},
			inclusive: true,
			exact: true,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
	var _a, _b;
	$ZodCheck.init(inst, def);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.format = def.format;
		if (def.pattern) {
			bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
			bag.patterns.add(def.pattern);
		}
	});
	if (def.pattern) (_a = inst._zod).check ?? (_a.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: def.format,
			input: payload.value,
			...def.pattern ? { pattern: def.pattern.toString() } : {},
			inst,
			continue: !def.abort
		});
	});
	else (_b = inst._zod).check ?? (_b.check = () => {});
});
const $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
	$ZodCheckStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "regex",
			input: payload.value,
			pattern: def.pattern.toString(),
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
	def.pattern ?? (def.pattern = lowercase);
	$ZodCheckStringFormat.init(inst, def);
});
const $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
	def.pattern ?? (def.pattern = uppercase);
	$ZodCheckStringFormat.init(inst, def);
});
const $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
	$ZodCheck.init(inst, def);
	const escapedRegex = escapeRegex(def.includes);
	const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position},}${escapedRegex}` : escapedRegex);
	def.pattern = pattern;
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
		bag.patterns.add(pattern);
	});
	inst._zod.check = (payload) => {
		if (payload.value.includes(def.includes, def.position)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "includes",
			includes: def.includes,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
	$ZodCheck.init(inst, def);
	const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
	def.pattern ?? (def.pattern = pattern);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
		bag.patterns.add(pattern);
	});
	inst._zod.check = (payload) => {
		if (payload.value.startsWith(def.prefix)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "starts_with",
			prefix: def.prefix,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
	$ZodCheck.init(inst, def);
	const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
	def.pattern ?? (def.pattern = pattern);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
		bag.patterns.add(pattern);
	});
	inst._zod.check = (payload) => {
		if (payload.value.endsWith(def.suffix)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "ends_with",
			suffix: def.suffix,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
	$ZodCheck.init(inst, def);
	inst._zod.check = (payload) => {
		payload.value = def.tx(payload.value);
	};
});
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/core/versions.js
const version = {
	major: 4,
	minor: 5,
	patch: 4
};
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/core/schemas.js
const $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
	var _a;
	inst ?? (inst = {});
	inst._zod.def = def;
	inst._zod.bag = inst._zod.bag || {};
	inst._zod.version = version;
	const defChecks = inst._zod.def.checks;
	const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
	for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
	if (checks.length === 0) {
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		inst._zod.deferred?.push(() => {
			inst._zod.run = inst._zod.parse;
		});
	} else {
		const runChecks = (payload, checks, ctx) => {
			if (payload.memo) return payload;
			let isAborted = aborted(payload);
			let asyncResult;
			for (const ch of checks) {
				if (ch._zod.def.when) {
					if (explicitlyAborted(payload)) continue;
					if (!ch._zod.def.when(payload)) continue;
				} else if (isAborted) continue;
				const currLen = payload.issues.length;
				const _ = ch._zod.check(payload);
				if (_ instanceof Promise && ctx?.async === false) throw new $ZodAsyncError();
				if (asyncResult || _ instanceof Promise) asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
					await _;
					if (payload.issues.length === currLen) return;
					attachSchema(payload.issues, currLen, inst);
					if (!isAborted) isAborted = aborted(payload, currLen);
				});
				else {
					if (payload.issues.length === currLen) continue;
					attachSchema(payload.issues, currLen, inst);
					if (!isAborted) isAborted = aborted(payload, currLen);
				}
			}
			if (asyncResult) return asyncResult.then(() => {
				return payload;
			});
			return payload;
		};
		const handleCanaryResult = (canary, payload, ctx) => {
			if (aborted(canary)) {
				canary.aborted = true;
				return canary;
			}
			const checkResult = runChecks(payload, checks, ctx);
			if (checkResult instanceof Promise) {
				if (ctx.async === false) throw new $ZodAsyncError();
				return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
			}
			return inst._zod.parse(checkResult, ctx);
		};
		inst._zod.run = (payload, ctx) => {
			if (ctx.skipChecks) return inst._zod.parse(payload, ctx);
			if (ctx.direction === "backward") {
				const canary = inst._zod.parse({
					value: payload.value,
					issues: []
				}, {
					...ctx,
					skipChecks: true
				});
				if (canary instanceof Promise) return canary.then((canary) => {
					return handleCanaryResult(canary, payload, ctx);
				});
				return handleCanaryResult(canary, payload, ctx);
			}
			const result = inst._zod.parse(payload, ctx);
			if (result instanceof Promise) {
				if (ctx.async === false) throw new $ZodAsyncError();
				return result.then((result) => runChecks(result, checks, ctx));
			}
			return runChecks(result, checks, ctx);
		};
	}
}, {
	get "~standard"() {
		return hide(this, "~standard", standardProps(this));
	},
	set "~standard"(value) {
		own(this, "~standard", value);
	}
});
/** The Standard Schema surface for `inst`. Shared so wrappers can extend it without forcing it. */
const toStandardResult = (r) => r.success ? { value: r.data } : { issues: r.error?.issues };
function standardProps(inst) {
	return {
		validate: (value) => {
			try {
				return toStandardResult(safeParse$1(inst, value));
			} catch (_) {
				return safeParseAsync$1(inst, value).then(toStandardResult);
			}
		},
		vendor: "zod",
		version: 1
	};
}
const $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string$1(inst._zod.bag);
	inst._zod.parse = (payload, _) => {
		if (def.coerce) try {
			payload.value = String(payload.value);
		} catch (_) {}
		if (typeof payload.value === "string") return payload;
		payload.issues.push({
			expected: "string",
			code: "invalid_type",
			input: payload.value,
			inst
		});
		return payload;
	};
});
const $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
	$ZodCheckStringFormat.init(inst, def);
	$ZodString.init(inst, def);
});
const $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
	def.pattern ?? (def.pattern = guid);
	$ZodStringFormat.init(inst, def);
});
const $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
	if (def.version) {
		const v = {
			v1: 1,
			v2: 2,
			v3: 3,
			v4: 4,
			v5: 5,
			v6: 6,
			v7: 7,
			v8: 8
		}[def.version];
		if (v === void 0) throw new Error(`Invalid UUID version: "${def.version}"`);
		def.pattern ?? (def.pattern = uuid(v));
	} else def.pattern ?? (def.pattern = uuid());
	$ZodStringFormat.init(inst, def);
});
const $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
	def.pattern ?? (def.pattern = email);
	$ZodStringFormat.init(inst, def);
});
/** Parses a URL for `$ZodURL`, applying the one guard the URL constructor cannot express. Returns the parsed URL, or a code naming the stage that rejected it — the runtime needs that distinction to pick an issue note, and compiled code only needs to know it is not a URL. */
function parseURLObject(trimmed, def) {
	if (!def.normalize && def.protocol?.source === httpProtocol.source && !/^https?:\/\//i.test(trimmed)) return 1;
	try {
		return new URL(trimmed);
	} catch {
		return 2;
	}
}
const asciiTabOrNewline = /[\t\n\r]/g;
/** The URL parser deletes every ASCII tab, LF and CR from its input before it parses, so `new URL("https://exa\nmple.com")` reports on `example.com`. Applying the same deletion to the returned value closes the half of that divergence which can move the host; the parser's other rewrite, stripping C0 controls at the edges, cannot. */
function stripTabAndNewline(value) {
	return value.replace(asciiTabOrNewline, "");
}
function urlHostnameOk(url, hostname) {
	hostname.lastIndex = 0;
	return hostname.test(url.hostname);
}
function urlProtocolOk(url, protocol) {
	protocol.lastIndex = 0;
	return protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol);
}
const $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		try {
			const trimmed = payload.value.trim();
			const url = parseURLObject(trimmed, def);
			if (url === 1) {
				payload.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid URL format",
					input: payload.value,
					inst,
					continue: !def.abort
				});
				return;
			}
			if (url === 2) {
				payload.issues.push({
					code: "invalid_format",
					format: "url",
					input: payload.value,
					inst,
					continue: !def.abort
				});
				return;
			}
			if (def.hostname && !urlHostnameOk(url, def.hostname)) payload.issues.push({
				code: "invalid_format",
				format: "url",
				note: "Invalid hostname",
				pattern: def.hostname.source,
				input: payload.value,
				inst,
				continue: !def.abort
			});
			if (def.protocol && !urlProtocolOk(url, def.protocol)) payload.issues.push({
				code: "invalid_format",
				format: "url",
				note: "Invalid protocol",
				pattern: def.protocol.source,
				input: payload.value,
				inst,
				continue: !def.abort
			});
			payload.value = def.normalize ? url.href : stripTabAndNewline(trimmed);
			return;
		} catch (_) {
			payload.issues.push({
				code: "invalid_format",
				format: "url",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		}
	};
});
const $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
	def.pattern ?? (def.pattern = emoji());
	$ZodStringFormat.init(inst, def);
});
const $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
	if (def.length !== void 0 && (!Number.isInteger(def.length) || def.length < 1)) throw new Error(`Invalid nanoid length: ${def.length}`);
	def.pattern ?? (def.pattern = def.length === void 0 ? nanoid : nanoidOfLength(def.length));
	$ZodStringFormat.init(inst, def);
});
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
* See https://github.com/paralleldrive/cuid.
*/
const $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
	def.pattern ?? (def.pattern = cuid);
	$ZodStringFormat.init(inst, def);
});
const $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
	def.pattern ?? (def.pattern = cuid2);
	$ZodStringFormat.init(inst, def);
});
const $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
	def.pattern ?? (def.pattern = ulid);
	$ZodStringFormat.init(inst, def);
});
const $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
	def.pattern ?? (def.pattern = xid);
	$ZodStringFormat.init(inst, def);
});
const $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
	def.pattern ?? (def.pattern = ksuid);
	$ZodStringFormat.init(inst, def);
});
const $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
	def.pattern ?? (def.pattern = datetime(def));
	$ZodStringFormat.init(inst, def);
	if (def.local || def.precision === -1) {
		inst._zod.bag.laxFormat = true;
		inst._zod.onattach.push((s) => {
			s._zod.bag.laxFormat = true;
		});
	}
});
const $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
	def.pattern ?? (def.pattern = date);
	$ZodStringFormat.init(inst, def);
});
const $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
	def.pattern ?? (def.pattern = time(def));
	$ZodStringFormat.init(inst, def);
});
const $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
	def.pattern ?? (def.pattern = duration);
	$ZodStringFormat.init(inst, def);
});
const $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
	def.pattern ?? (def.pattern = ipv4);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.format = `ipv4`;
});
/** An IPv6 address is written with hex digits, colons and dots, and nothing else. The guard is what makes the check below an IPv6 check: `new URL("http://[...]")` parses an authority, not an address, so `@` and `\` re-delimit it and `"::@1\\"` validates against the host `0.0.0.1`. The URL parser also deletes ASCII tab, LF and CR rather than failing, which is how `"::1\n"` validated as `::1`. */
const ipv6Alphabet = /^[0-9a-fA-F:.]+$/;
function isValidIPv6(value) {
	if (!ipv6Alphabet.test(value)) return false;
	try {
		new URL(`http://[${value}]`);
		return true;
	} catch {
		return false;
	}
}
const $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
	def.pattern ?? (def.pattern = ipv6);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.format = `ipv6`;
	inst._zod.check = (payload) => {
		if (!isValidIPv6(payload.value)) payload.issues.push({
			code: "invalid_format",
			format: "ipv6",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
	def.pattern ?? (def.pattern = cidrv4);
	$ZodStringFormat.init(inst, def);
});
function isValidCIDRv6(value) {
	const parts = value.split("/");
	if (parts.length !== 2) return false;
	const [address, prefix] = parts;
	if (!prefix) return false;
	const prefixNum = Number(prefix);
	if (`${prefixNum}` !== prefix) return false;
	if (prefixNum < 0 || prefixNum > 128) return false;
	return isValidIPv6(address);
}
const $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
	def.pattern ?? (def.pattern = cidrv6);
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (!isValidCIDRv6(payload.value)) payload.issues.push({
			code: "invalid_format",
			format: "cidrv6",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
function isValidBase64(data) {
	if (data === "") return true;
	if (/\s/.test(data)) return false;
	if (data.length % 4 !== 0) return false;
	try {
		atob(data);
		return true;
	} catch {
		return false;
	}
}
const $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
	def.pattern ?? (def.pattern = base64);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.contentEncoding = "base64";
	inst._zod.check = (payload) => {
		if (isValidBase64(payload.value)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "base64",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
function isValidBase64URL(data) {
	if (!base64url.test(data)) return false;
	const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
	return isValidBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}
const $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
	def.pattern ?? (def.pattern = base64url);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.contentEncoding = "base64url";
	inst._zod.check = (payload) => {
		if (isValidBase64URL(payload.value)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "base64url",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
	def.pattern ?? (def.pattern = e164);
	$ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
	try {
		const tokensParts = token.split(".");
		if (tokensParts.length !== 3) return false;
		const [header] = tokensParts;
		if (!header) return false;
		const parsedHeader = JSON.parse(atob(header));
		if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT") return false;
		if (!parsedHeader.alg) return false;
		if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm)) return false;
		return true;
	} catch {
		return false;
	}
}
const $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (isValidJWT(payload.value, def.alg)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "jwt",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
function handleArrayResult(result, final, index) {
	if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
	final.value[index] = result.value;
}
const $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
	$ZodType.init(inst, def);
	const memo = globalConfig.memoizer;
	memo?.attach(inst);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!Array.isArray(input)) {
			payload.issues.push({
				expected: "array",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		payload.value = memo ? memo.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
		const proms = [];
		for (let i = 0; i < input.length; i++) {
			const item = input[i];
			const result = def.element._zod.run({
				value: item,
				issues: []
			}, ctx);
			if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
			else handleArrayResult(result, payload, i);
		}
		if (proms.length) return Promise.all(proms).then(() => payload);
		return payload;
	};
});
function handleUnionResults(results, final, inst, ctx) {
	for (const result of results) if (result.issues.length === 0) {
		final.value = result.value;
		return final;
	}
	const nonaborted = results.filter((r) => !aborted(r));
	if (nonaborted.length === 1) {
		final.value = nonaborted[0].value;
		return nonaborted[0];
	}
	final.issues.push({
		code: "invalid_union",
		input: final.value,
		inst,
		errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	});
	return final;
}
const $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o) => o._zod.optin !== void 0) ? "optional" : void 0);
	defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
	defineLazyInternal(inst, "values", (zod) => {
		if (zod.def.options.every((o) => o._zod.values)) return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
	});
	defineLazyInternal(inst, "pattern", (zod) => {
		if (zod.def.options.every((o) => o._zod.pattern)) {
			const patterns = zod.def.options.map((o) => o._zod.pattern);
			return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
		}
	});
	const first = def.options.length === 1 ? def.options[0]._zod.run : null;
	inst._zod.parse = (payload, ctx) => {
		if (first) return first(payload, ctx);
		let async = false;
		const results = [];
		for (const option of def.options) {
			const result = option._zod.run({
				value: payload.value,
				issues: []
			}, ctx);
			if (result instanceof Promise) {
				results.push(result);
				async = true;
			} else {
				if (result.issues.length === 0) return result;
				results.push(result);
			}
		}
		if (!async) return handleUnionResults(results, payload, inst, ctx);
		return Promise.all(results).then((results) => {
			return handleUnionResults(results, payload, inst, ctx);
		});
	};
});
const $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		const left = def.left._zod.run({
			value: input,
			issues: []
		}, ctx);
		const right = def.right._zod.run({
			value: input,
			issues: []
		}, ctx);
		if (left instanceof Promise || right instanceof Promise) return Promise.all([left, right]).then(([left, right]) => {
			return handleIntersectionResults(payload, left, right);
		});
		return handleIntersectionResults(payload, left, right);
	};
});
function mergeValues(a, b) {
	if (a === b) return {
		valid: true,
		data: a
	};
	if (a instanceof Date && b instanceof Date && +a === +b) return {
		valid: true,
		data: a
	};
	if (isPlainObject(a) && isPlainObject(b)) {
		const bKeys = Object.keys(b);
		const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
		const newObj = {
			...a,
			...b
		};
		if (Object.prototype.hasOwnProperty.call(newObj, "__proto__")) delete newObj.__proto__;
		for (const key of sharedKeys) {
			if (key === "__proto__") continue;
			const sharedValue = mergeValues(a[key], b[key]);
			if (!sharedValue.valid) return {
				valid: false,
				mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
			};
			newObj[key] = sharedValue.data;
		}
		return {
			valid: true,
			data: newObj
		};
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return {
			valid: false,
			mergeErrorPath: []
		};
		const newArray = [];
		for (let index = 0; index < a.length; index++) {
			const itemA = a[index];
			const itemB = b[index];
			const sharedValue = mergeValues(itemA, itemB);
			if (!sharedValue.valid) return {
				valid: false,
				mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
			};
			newArray.push(sharedValue.data);
		}
		return {
			valid: true,
			data: newArray
		};
	}
	return {
		valid: false,
		mergeErrorPath: []
	};
}
function handleIntersectionResults(result, left, right) {
	const unrecKeys = /* @__PURE__ */ new Map();
	let unrecIssue;
	const keyIssues = /* @__PURE__ */ new Map();
	const collect = (iss, side) => {
		let keys;
		if (iss.code === "unrecognized_keys" && !iss.path?.length) {
			unrecIssue ?? (unrecIssue = iss);
			keys = iss.keys;
		} else if (iss.code === "invalid_key" && iss.origin === "record" && iss.path?.length === 1) {
			const k = String(iss.path[0]);
			if (!keyIssues.has(k)) keyIssues.set(k, iss);
			keys = [k];
		} else return false;
		for (const k of keys) {
			if (!unrecKeys.has(k)) unrecKeys.set(k, {});
			unrecKeys.get(k)[side] = true;
		}
		return true;
	};
	for (const iss of left.issues) if (!collect(iss, "l")) result.issues.push(iss);
	for (const iss of right.issues) if (!collect(iss, "r")) result.issues.push(iss);
	const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
	if (bothKeys.length) {
		const aggregated = unrecIssue ? bothKeys.filter((k) => unrecIssue.keys.includes(k)) : [];
		if (aggregated.length) result.issues.push({
			...unrecIssue,
			keys: aggregated
		});
		for (const k of bothKeys) if (!aggregated.includes(k) && keyIssues.has(k)) result.issues.push(keyIssues.get(k));
	}
	const merged = mergeValues(left.value, right.value);
	if (!merged.valid) {
		if (aborted(result)) return result;
		throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
	}
	result.value = merged.data;
	return result;
}
const $ZodRecord = /*@__PURE__*/ $constructor("$ZodRecord", (inst, def) => {
	$ZodType.init(inst, def);
	const memo = globalConfig.memoizer;
	memo?.attach(inst);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!isPlainObject(input)) {
			payload.issues.push({
				expected: "record",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		const proms = [];
		const values = def.keyType._zod.values;
		if (values && !def.partial) {
			payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
			const recordKeys = /* @__PURE__ */ new Set();
			for (const key of values) if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
				recordKeys.add(typeof key === "number" ? key.toString() : key);
				if (key === "__proto__") continue;
				const keyResult = def.keyType._zod.run({
					value: key,
					issues: []
				}, ctx);
				if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
				if (keyResult.issues.length) {
					payload.issues.push({
						code: "invalid_key",
						origin: "record",
						issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
						input: key,
						path: [key],
						inst
					});
					continue;
				}
				const outKey = keyResult.value;
				if (outKey === "__proto__") continue;
				const result = def.valueType._zod.run({
					value: input[key],
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((result) => {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}));
				else {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}
			}
			let unrecognized;
			for (const key in input) if (!recordKeys.has(key)) {
				if (def.mode === "loose") {
					if (key === "__proto__") continue;
					payload.value[key] = input[key];
				} else {
					unrecognized = unrecognized ?? [];
					unrecognized.push(key);
				}
			}
			if (unrecognized && unrecognized.length > 0) payload.issues.push({
				code: "unrecognized_keys",
				input,
				inst,
				keys: unrecognized,
				continue: true
			});
		} else {
			payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
			let unrecognized;
			for (const key of Reflect.ownKeys(input)) {
				if (key === "__proto__") continue;
				if (!Object.prototype.propertyIsEnumerable.call(input, key)) continue;
				let keyResult = def.keyType._zod.run({
					value: key,
					issues: []
				}, ctx);
				if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
				if (typeof key === "string" && number.test(key) && keyResult.issues.length) {
					const retryResult = def.keyType._zod.run({
						value: Number(key),
						issues: []
					}, ctx);
					if (retryResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
					if (retryResult.issues.length === 0) keyResult = retryResult;
				}
				if (keyResult.issues.length) {
					if (def.mode === "loose") payload.value[key] = input[key];
					else if (values) {
						unrecognized = unrecognized ?? [];
						unrecognized.push(key);
					} else payload.issues.push({
						code: "invalid_key",
						origin: "record",
						issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
						input: key,
						path: [key],
						inst
					});
					continue;
				}
				const outKey = keyResult.value;
				if (outKey === "__proto__") continue;
				const result = def.valueType._zod.run({
					value: input[key],
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((result) => {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}));
				else {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}
			}
			if (unrecognized && unrecognized.length > 0) payload.issues.push({
				code: "unrecognized_keys",
				input,
				inst,
				keys: unrecognized,
				continue: true
			});
		}
		if (proms.length) return Promise.all(proms).then(() => payload);
		return payload;
	};
});
const $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
	$ZodType.init(inst, def);
	const values = getEnumValues(def.entries);
	const valuesSet = new Set(values);
	inst._zod.values = valuesSet;
	const patternValues = values.filter((k) => propertyKeyTypes.has(typeof k));
	inst._zod.pattern = new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (valuesSet.has(input)) return payload;
		payload.issues.push({
			code: "invalid_value",
			values,
			input,
			inst
		});
		return payload;
	};
});
const $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	globalConfig.memoizer?.guard(inst);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
		const _out = def.transform(payload.value, payload);
		if (ctx.async) return (_out instanceof Promise ? _out : Promise.resolve(_out)).then((output) => {
			payload.value = output;
			return payload;
		});
		if (_out instanceof Promise) throw new $ZodAsyncError();
		payload.value = _out;
		return payload;
	};
});
function handleOptionalResult(payload, result) {
	payload.value = result.issues.length ? void 0 : result.value;
	return payload;
}
const $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
	inst._zod.optout = "optional";
	defineLazyInternal(inst, "values", (zod) => {
		const values = zod.def.innerType._zod.values;
		return values ? /* @__PURE__ */ new Set([...values, void 0]) : void 0;
	});
	defineLazyInternal(inst, "pattern", (zod) => {
		const pattern = zod.def.innerType._zod.pattern;
		return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		if (payload.value === void 0) {
			if (def.innerType._zod.optin !== "defaulted") return payload;
			const result = def.innerType._zod.run({
				value: payload.value,
				issues: []
			}, ctx);
			if (result instanceof Promise) return result.then((result) => handleOptionalResult(payload, result));
			return handleOptionalResult(payload, result);
		}
		return def.innerType._zod.run(payload, ctx);
	};
});
const $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
	$ZodOptional.init(inst, def);
	defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
	defineLazyInternal(inst, "pattern", (zod) => zod.def.innerType._zod.pattern);
	inst._zod.parse = (payload, ctx) => {
		return def.innerType._zod.run(payload, ctx);
	};
});
const $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
	defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
	defineLazyInternal(inst, "pattern", (zod) => {
		const pattern = zod.def.innerType._zod.pattern;
		return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
	});
	defineLazyInternal(inst, "values", (zod) => {
		return zod.def.innerType._zod.values ? /* @__PURE__ */ new Set([...zod.def.innerType._zod.values, null]) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		if (payload.value === null) return payload;
		return def.innerType._zod.run(payload, ctx);
	};
});
const $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "defaulted";
	defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		if (payload.value === void 0) {
			payload.value = def.defaultValue;
			/**
			* $ZodDefault returns the default value immediately in forward direction.
			* It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
			return payload;
		}
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => handleDefaultResult(result, def));
		return handleDefaultResult(result, def);
	};
});
function handleDefaultResult(payload, def) {
	if (payload.value === void 0) payload.value = def.defaultValue;
	return payload;
}
const $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "defaulted";
	defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		if (payload.value === void 0) payload.value = def.defaultValue;
		return def.innerType._zod.run(payload, ctx);
	};
});
const $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "values", (zod) => {
		const v = zod.def.innerType._zod.values;
		return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => handleNonOptionalResult(result, inst));
		return handleNonOptionalResult(result, inst);
	};
});
function handleNonOptionalResult(payload, inst) {
	if (!payload.issues.length && payload.value === void 0) payload.issues.push({
		code: "invalid_type",
		expected: "nonoptional",
		input: payload.value,
		inst
	});
	return payload;
}
function handleCatchResult(payload, result, def, ctx) {
	if (!result.issues.length) {
		payload.value = result.value;
		if (result.memo) payload.memo = true;
		return payload;
	}
	payload.value = def.catchValue({
		...result,
		value: payload.value,
		error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
		input: payload.value
	});
	return payload;
}
const $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
	defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
	defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		const result = def.innerType._zod.run({
			value: payload.value,
			issues: []
		}, ctx);
		if (result instanceof Promise) return result.then((result) => handleCatchResult(payload, result, def, ctx));
		return handleCatchResult(payload, result, def, ctx);
	};
});
const $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "values", (zod) => zod.def.in._zod.values);
	defineLazyInternal(inst, "optin", (zod) => zod.def.in._zod.optin);
	defineLazyInternal(inst, "optout", (zod) => zod.def.out._zod.optout);
	defineLazyInternal(inst, "propValues", (zod) => zod.def.in._zod.propValues);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") {
			const right = def.out._zod.run(payload, ctx);
			if (right instanceof Promise) return right.then((right) => handlePipeResult(right, def.in, ctx));
			return handlePipeResult(right, def.in, ctx);
		}
		const left = def.in._zod.run(payload, ctx);
		if (left instanceof Promise) return left.then((left) => handlePipeResult(left, def.out, ctx));
		return handlePipeResult(left, def.out, ctx);
	};
});
function handlePipeResult(left, next, ctx) {
	if (left.issues.some((iss) => iss.code !== "unrecognized_keys")) {
		left.aborted = true;
		return left;
	}
	return next._zod.run({
		value: left.value,
		issues: left.issues
	}, ctx);
}
const $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "propValues", (zod) => zod.def.innerType._zod.propValues);
	defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
	defineLazyInternal(inst, "optin", (zod) => zod.def.innerType?._zod?.optin);
	defineLazyInternal(inst, "optout", (zod) => zod.def.innerType?._zod?.optout);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then(handleReadonlyResult);
		return handleReadonlyResult(result);
	};
});
function handleReadonlyResult(payload) {
	if (!payload.memo) payload.value = Object.freeze(payload.value);
	return payload;
}
const $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
	$ZodCheck.init(inst, def);
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _) => {
		return payload;
	};
	inst._zod.check = (payload) => {
		const input = payload.value;
		const r = def.fn(input);
		if (r instanceof Promise) return r.then((r) => handleRefineResult(r, payload, input, inst));
		handleRefineResult(r, payload, input, inst);
	};
});
function handleRefineResult(result, payload, input, inst) {
	if (!result) {
		const _iss = {
			code: "custom",
			input,
			inst,
			path: [...inst._zod.def.path ?? []],
			continue: !inst._zod.def.abort
		};
		if (inst._zod.def.params) _iss.params = inst._zod.def.params;
		payload.issues.push(issue(_iss));
	}
}
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/core/memoizer.js
var $ZodCyclicError = class extends Error {
	constructor() {
		super(`Cannot parse a reference cycle that closes through a transform`);
		this.name = "ZodCyclicError";
	}
};
/** Keyed off the context object every schema in one parse call already shares. */
const STATE = "~memo";
const NO_ISSUES = [];
function cloneIssues(issues) {
	return issues.map((iss) => iss.path ? {
		...iss,
		path: iss.path.slice()
	} : { ...iss });
}
const recursive = /*@__PURE__*/ new WeakMap();
/** Whether this schema's subtree contains a cycle, so one parse can re-enter it. */
function isRecursive(inst, stack) {
	const cached = recursive.get(inst);
	if (cached !== void 0) return cached;
	if (stack.has(inst)) return true;
	stack.add(inst);
	let result = false;
	const check = (child) => {
		if (!result && child?._zod && isRecursive(child, stack)) result = true;
	};
	const def = inst._zod.def;
	switch (def.type) {
		case "object":
			for (const key of Reflect.ownKeys(def.shape)) check(def.shape[key]);
			check(def.catchall);
			break;
		case "array":
			check(def.element);
			break;
		case "tuple":
			for (const el of def.items) check(el);
			check(def.rest);
			break;
		case "record":
		case "map":
			check(def.keyType);
			check(def.valueType);
			break;
		case "set":
			check(def.valueType);
			break;
		case "union":
			for (const el of def.options) check(el);
			break;
		case "intersection":
			check(def.left);
			check(def.right);
			break;
		case "optional":
		case "nullable":
		case "default":
		case "prefault":
		case "catch":
		case "readonly":
		case "nonoptional":
		case "promise":
		case "success":
			check(def.innerType);
			break;
		case "pipe":
			check(def.in);
			check(def.out);
			break;
		case "function":
			check(def.input);
			check(def.output);
			break;
		case "lazy":
			check(inst._zod.innerType);
			break;
		case "template_literal":
		case "string":
		case "number":
		case "int":
		case "boolean":
		case "bigint":
		case "symbol":
		case "undefined":
		case "null":
		case "void":
		case "never":
		case "any":
		case "unknown":
		case "date":
		case "nan":
		case "enum":
		case "literal":
		case "file":
		case "transform":
		case "custom": break;
		default: for (const key in def) {
			const desc = Object.getOwnPropertyDescriptor(def, key);
			if (!desc || desc.get) continue;
			const value = desc.value;
			if (!value || typeof value !== "object") continue;
			if (value._zod) check(value);
			else if (Array.isArray(value)) for (const el of value) check(el);
		}
	}
	stack.delete(inst);
	recursive.set(inst, result);
	return result;
}
function bucketFor(state, inst) {
	let bucket = state.buckets.get(inst);
	if (!bucket) {
		bucket = /* @__PURE__ */ new Map();
		state.buckets.set(inst, bucket);
	}
	return bucket;
}
let handoff;
const open = [];
const memo = {
	alloc(_inst, payload, empty) {
		const bucket = handoff;
		if (!bucket) return empty;
		handoff = void 0;
		const entry = {
			value: empty,
			issues: null
		};
		bucket.set(payload.value, entry);
		open.push(entry);
		return empty;
	},
	guard(inst) {
		var _a;
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		inst._zod.deferred.push(() => {
			const base = inst._zod.parse;
			const wrapped = (payload, ctx) => {
				if (ctx.direction !== "backward" && isBackEdge(ctx, payload.value)) throw new $ZodCyclicError();
				return base(payload, ctx);
			};
			inst._zod.parse = wrapped;
			if (inst._zod.run === base) inst._zod.run = wrapped;
		});
	},
	attach(inst) {
		var _a;
		let isRecursiveInst;
		let lastCtx;
		let lastBucket;
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		inst._zod.deferred.push(() => {
			const base = inst._zod.parse;
			const wrapped = (payload, ctx) => {
				if (isRecursiveInst === void 0) {
					isRecursiveInst = isRecursive(inst, /* @__PURE__ */ new Set());
					if (!isRecursiveInst) {
						inst._zod.parse = base;
						if (inst._zod.run === wrapped) inst._zod.run = base;
						return base(payload, ctx);
					}
				}
				const input = payload.value;
				if (input === null || typeof input !== "object") return base(payload, ctx);
				let state = ctx[STATE];
				if (!state) {
					state = {
						buckets: /* @__PURE__ */ new Map(),
						backEdges: void 0
					};
					ctx[STATE] = state;
				}
				let bucket;
				if (lastCtx === ctx) bucket = lastBucket;
				else {
					bucket = bucketFor(state, inst);
					lastCtx = ctx;
					lastBucket = bucket;
				}
				const hit = bucket.get(input);
				if (hit) {
					payload.value = hit.value;
					if (hit.issues) {
						if (hit.issues.length) payload.issues.push(...cloneIssues(hit.issues));
					} else {
						payload.memo = true;
						state.backEdges ?? (state.backEdges = /* @__PURE__ */ new Set());
						state.backEdges.add(hit.value);
					}
					return payload;
				}
				handoff = bucket;
				const depth = open.length;
				const result = base(payload, ctx);
				handoff = void 0;
				const entry = open.length > depth ? open.pop() : void 0;
				if (result instanceof Promise) return result.then((r) => {
					if (entry) entry.issues = r.issues.length ? cloneIssues(r.issues) : NO_ISSUES;
					return r;
				});
				if (entry) entry.issues = result.issues.length ? cloneIssues(result.issues) : NO_ISSUES;
				return result;
			};
			inst._zod.parse = wrapped;
			if (inst._zod.run === base) inst._zod.run = wrapped;
		});
	}
};
/** The memoizer that gives containers cycle support. `zod` installs it by default; `zod/mini` opts in with `config({ memoizer: memoizer() })`. */
function memoizer() {
	return memo;
}
/** Whether this value is a node a back-edge resolved to before it finished. */
function isBackEdge(ctx, value) {
	const backEdges = ctx[STATE]?.backEdges;
	return backEdges !== void 0 && value !== null && typeof value === "object" && backEdges.has(value);
}
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/locales/en.js
const error = () => {
	const Sizable = {
		string: {
			unit: "characters",
			verb: "to have"
		},
		file: {
			unit: "bytes",
			verb: "to have"
		},
		array: {
			unit: "items",
			verb: "to have"
		},
		set: {
			unit: "items",
			verb: "to have"
		},
		map: {
			unit: "entries",
			verb: "to have"
		}
	};
	function getSizing(origin) {
		return Sizable[origin] ?? null;
	}
	const FormatDictionary = {
		regex: "input",
		email: "email address",
		url: "URL",
		emoji: "emoji",
		uuid: "UUID",
		uuidv4: "UUIDv4",
		uuidv6: "UUIDv6",
		nanoid: "nanoid",
		guid: "GUID",
		cuid: "cuid",
		cuid2: "cuid2",
		ulid: "ULID",
		xid: "XID",
		ksuid: "KSUID",
		datetime: "ISO datetime",
		date: "ISO date",
		time: "ISO time",
		duration: "ISO duration",
		ipv4: "IPv4 address",
		ipv6: "IPv6 address",
		mac: "MAC address",
		cidrv4: "IPv4 range",
		cidrv6: "IPv6 range",
		base64: "base64-encoded string",
		base64url: "base64url-encoded string",
		json_string: "JSON string",
		e164: "E.164 number",
		credit_card: "credit card number",
		jwt: "JWT",
		template_literal: "input"
	};
	const TypeDictionary = { nan: "NaN" };
	function getTypeName(type, input) {
		if (type === "number" && typeof input === "number" && !Number.isFinite(input)) return String(input);
		return TypeDictionary[type] ?? type;
	}
	return (issue) => {
		switch (issue.code) {
			case "invalid_type": return `Invalid input: expected ${getTypeName(issue.expected)}, received ${getTypeName(parsedType(issue.input), issue.input)}`;
			case "invalid_value":
				if (issue.values.length === 1) return `Invalid input: expected ${stringifyPrimitive(issue.values[0])}`;
				return `Invalid option: expected one of ${joinValues(issue.values, "|")}`;
			case "too_big": {
				const adj = issue.exact ? "exactly " : issue.inclusive ? "<=" : "<";
				const sizing = getSizing(issue.origin);
				if (sizing) return `Too big: expected ${issue.origin ?? "value"} to have ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elements"}`;
				return `Too big: expected ${issue.origin ?? "value"} to be ${adj}${issue.maximum.toString()}`;
			}
			case "too_small": {
				const adj = issue.exact ? "exactly " : issue.inclusive ? ">=" : ">";
				const sizing = getSizing(issue.origin);
				if (sizing) return `Too small: expected ${issue.origin} to have ${adj}${issue.minimum.toString()} ${sizing.unit}`;
				return `Too small: expected ${issue.origin} to be ${adj}${issue.minimum.toString()}`;
			}
			case "invalid_format": {
				const _issue = issue;
				if (_issue.format === "starts_with") return `Invalid string: must start with "${_issue.prefix}"`;
				if (_issue.format === "ends_with") return `Invalid string: must end with "${_issue.suffix}"`;
				if (_issue.format === "includes") return `Invalid string: must include "${_issue.includes}"`;
				if (_issue.format === "regex") return `Invalid string: must match pattern ${_issue.pattern}`;
				return `Invalid ${FormatDictionary[_issue.format] ?? issue.format}`;
			}
			case "not_multiple_of": return `Invalid number: must be a multiple of ${issue.divisor}`;
			case "unrecognized_keys": return `Unrecognized key${issue.keys.length > 1 ? "s" : ""}: ${joinValues(issue.keys, ", ")}`;
			case "invalid_key": return `Invalid key in ${issue.origin}`;
			case "invalid_union":
				if (issue.options && Array.isArray(issue.options) && issue.options.length > 0) return `Invalid discriminator value. Expected ${issue.options.map((o) => `'${o}'`).join(" | ")}`;
				if (issue.inclusive === false) return "Invalid input: more than one option matched";
				return "Invalid input";
			case "invalid_element": return `Invalid value in ${issue.origin}`;
			default: return `Invalid input`;
		}
	};
};
function en_default() {
	return { localeError: error() };
}
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/core/registries.js
var _a;
var $ZodRegistry = class {
	constructor() {
		this._map = /* @__PURE__ */ new WeakMap();
		this._idmap = /* @__PURE__ */ new Map();
	}
	add(schema, ..._meta) {
		const meta = _meta[0];
		this._map.set(schema, meta);
		if (meta && typeof meta === "object" && "id" in meta) this._idmap.set(meta.id, schema);
		return this;
	}
	clear() {
		this._map = /* @__PURE__ */ new WeakMap();
		this._idmap = /* @__PURE__ */ new Map();
		return this;
	}
	remove(schema) {
		const meta = this._map.get(schema);
		if (meta && typeof meta === "object" && "id" in meta) this._idmap.delete(meta.id);
		this._map.delete(schema);
		return this;
	}
	get(schema) {
		const p = schema._zod.parent;
		if (p) {
			const pm = { ...this.get(p) ?? {} };
			delete pm.id;
			const f = {
				...pm,
				...this._map.get(schema)
			};
			return Object.keys(f).length ? f : void 0;
		}
		return this._map.get(schema);
	}
	has(schema) {
		return this._map.has(schema);
	}
};
function registry() {
	return new $ZodRegistry();
}
(_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry());
const globalRegistry = globalThis.__zod_globalRegistry;
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/core/api.js
// @__NO_SIDE_EFFECTS__
function _string(Class, params) {
	return new Class({
		type: "string",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _email(Class, params) {
	return new Class({
		type: "string",
		format: "email",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _guid(Class, params) {
	return new Class({
		type: "string",
		format: "guid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuid(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv4(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v4",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv6(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v6",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv7(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v7",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _url(Class, params) {
	return new Class({
		type: "string",
		format: "url",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _emoji(Class, params) {
	return new Class({
		type: "string",
		format: "emoji",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _nanoid(Class, params) {
	return new Class({
		type: "string",
		format: "nanoid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link _cuid2} instead.
* See https://github.com/paralleldrive/cuid.
*/
// @__NO_SIDE_EFFECTS__
function _cuid(Class, params) {
	return new Class({
		type: "string",
		format: "cuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cuid2(Class, params) {
	return new Class({
		type: "string",
		format: "cuid2",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ulid(Class, params) {
	return new Class({
		type: "string",
		format: "ulid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _xid(Class, params) {
	return new Class({
		type: "string",
		format: "xid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ksuid(Class, params) {
	return new Class({
		type: "string",
		format: "ksuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ipv4(Class, params) {
	return new Class({
		type: "string",
		format: "ipv4",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ipv6(Class, params) {
	return new Class({
		type: "string",
		format: "ipv6",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cidrv4(Class, params) {
	return new Class({
		type: "string",
		format: "cidrv4",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cidrv6(Class, params) {
	return new Class({
		type: "string",
		format: "cidrv6",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _base64(Class, params) {
	return new Class({
		type: "string",
		format: "base64",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _base64url(Class, params) {
	return new Class({
		type: "string",
		format: "base64url",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _e164(Class, params) {
	return new Class({
		type: "string",
		format: "e164",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _jwt(Class, params) {
	return new Class({
		type: "string",
		format: "jwt",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDateTime(Class, params) {
	return new Class({
		type: "string",
		format: "datetime",
		check: "string_format",
		offset: false,
		local: false,
		precision: null,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDate(Class, params) {
	return new Class({
		type: "string",
		format: "date",
		check: "string_format",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoTime(Class, params) {
	return new Class({
		type: "string",
		format: "time",
		check: "string_format",
		precision: null,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDuration(Class, params) {
	return new Class({
		type: "string",
		format: "duration",
		check: "string_format",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
	return new $ZodCheckMaxLength({
		check: "max_length",
		...normalizeParams(params),
		maximum
	});
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
	return new $ZodCheckMinLength({
		check: "min_length",
		...normalizeParams(params),
		minimum
	});
}
// @__NO_SIDE_EFFECTS__
function _length(length, params) {
	return new $ZodCheckLengthEquals({
		check: "length_equals",
		...normalizeParams(params),
		length
	});
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
	return new $ZodCheckRegex({
		check: "string_format",
		format: "regex",
		...normalizeParams(params),
		pattern
	});
}
// @__NO_SIDE_EFFECTS__
function _lowercase(params) {
	return new $ZodCheckLowerCase({
		check: "string_format",
		format: "lowercase",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uppercase(params) {
	return new $ZodCheckUpperCase({
		check: "string_format",
		format: "uppercase",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _includes(includes, params) {
	return new $ZodCheckIncludes({
		check: "string_format",
		format: "includes",
		...normalizeParams(params),
		includes
	});
}
// @__NO_SIDE_EFFECTS__
function _startsWith(prefix, params) {
	return new $ZodCheckStartsWith({
		check: "string_format",
		format: "starts_with",
		...normalizeParams(params),
		prefix
	});
}
// @__NO_SIDE_EFFECTS__
function _endsWith(suffix, params) {
	return new $ZodCheckEndsWith({
		check: "string_format",
		format: "ends_with",
		...normalizeParams(params),
		suffix
	});
}
// @__NO_SIDE_EFFECTS__
function _overwrite(tx) {
	return new $ZodCheckOverwrite({
		check: "overwrite",
		tx
	});
}
// @__NO_SIDE_EFFECTS__
function _normalize(form) {
	return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
}
// @__NO_SIDE_EFFECTS__
function _trim() {
	return /* @__PURE__ */ _overwrite((input) => input.trim());
}
// @__NO_SIDE_EFFECTS__
function _toLowerCase() {
	return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function _toUpperCase() {
	return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function _slugify() {
	return /* @__PURE__ */ _overwrite((input) => slugify(input));
}
// @__NO_SIDE_EFFECTS__
function _array(Class, element, params) {
	return new Class({
		type: "array",
		element,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _refine(Class, fn, _params) {
	return new Class({
		type: "custom",
		check: "custom",
		fn,
		...normalizeParams(_params)
	});
}
// @__NO_SIDE_EFFECTS__
function _superRefine(fn, params) {
	const ch = /* @__PURE__ */ _check((payload) => {
		payload.addIssue = (issue$2) => {
			if (typeof issue$2 === "string") payload.issues.push(issue(issue$2, payload.value, ch._zod.def));
			else {
				const _issue = issue$2;
				if (_issue.fatal) _issue.continue = false;
				_issue.code ?? (_issue.code = "custom");
				if (!("input" in _issue)) _issue.input = payload.value;
				_issue.inst ?? (_issue.inst = ch);
				_issue.continue ?? (_issue.continue = !ch._zod.def.abort);
				payload.issues.push(issue(_issue));
			}
		};
		return fn(payload.value, payload);
	}, params);
	return ch;
}
// @__NO_SIDE_EFFECTS__
function _check(fn, params) {
	const ch = new $ZodCheck({
		check: "custom",
		...normalizeParams(params)
	});
	ch._zod.check = fn;
	return ch;
}
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/core/to-json-schema.js
function assignProps(target, ...sources) {
	for (const source of sources) for (const key of Reflect.ownKeys(source)) if (Object.prototype.propertyIsEnumerable.call(source, key)) assignProp(target, key, source[key]);
	return target;
}
function initializeContext(params) {
	let target = params?.target ?? "draft-2020-12";
	if (target === "draft-4") target = "draft-04";
	if (target === "draft-7") target = "draft-07";
	return {
		processors: params.processors ?? {},
		metadataRegistry: params?.metadata ?? globalRegistry,
		target,
		unrepresentable: params?.unrepresentable ?? "throw",
		override: params?.override ?? (() => {}),
		io: params?.io ?? "output",
		counter: 0,
		seen: /* @__PURE__ */ new Map(),
		sharedDefsExtractedFor: void 0,
		sharedEmitDoneFor: void 0,
		cycles: params?.cycles ?? "ref",
		reused: params?.reused ?? "inline",
		intersections: [],
		deferred: [],
		external: params?.external ?? void 0
	};
}
/**
* Applies the `unrepresentable` setting at a site that has no JSON Schema equivalent. Throws
* `message` unless the setting (or the handler's return value) says otherwise. Returns `true` if a
* custom JSON Schema was written into `json`, in which case the caller must not write its own.
*/
function handleUnrepresentable(schema, ctx, json, params, message) {
	const result = typeof ctx.unrepresentable === "function" ? ctx.unrepresentable({
		zodSchema: schema,
		path: params.path,
		message
	}) : ctx.unrepresentable;
	if (result === "any") return false;
	if (result === void 0 || result === "throw") throw new Error(message);
	Object.assign(json, result);
	return true;
}
function process(schema, ctx, _params = {
	path: [],
	schemaPath: []
}) {
	var _a;
	const def = schema._zod.def;
	const seen = ctx.seen.get(schema);
	if (seen) {
		seen.count++;
		if (_params.schemaPath.includes(schema)) seen.cycle = _params.path;
		return seen.schema;
	}
	const result = {
		schema: {},
		count: 1,
		cycle: void 0,
		path: _params.path
	};
	ctx.seen.set(schema, result);
	ctx.sharedDefsExtractedFor = void 0;
	ctx.sharedEmitDoneFor = void 0;
	const overrideSchema = schema._zod.toJSONSchema?.();
	if (overrideSchema) result.schema = overrideSchema;
	else {
		const params = {
			..._params,
			schemaPath: [..._params.schemaPath, schema],
			path: _params.path
		};
		if (schema._zod.processJSONSchema) schema._zod.processJSONSchema(ctx, result.schema, params);
		else {
			const _json = result.schema;
			const processor = ctx.processors[def.type];
			if (!processor) throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
			processor(schema, ctx, _json, params);
		}
		const parent = schema._zod.parent;
		if (parent) {
			if (!result.ref) result.ref = parent;
			process(parent, ctx, params);
			ctx.seen.get(parent).isParent = true;
		}
	}
	const meta = ctx.metadataRegistry.get(schema);
	if (meta) assignProps(result.schema, meta);
	if (ctx.io === "input" && isTransforming(schema)) {
		delete result.schema.examples;
		delete result.schema.default;
	}
	if (ctx.io === "input" && "_prefault" in result.schema) (_a = result.schema).default ?? (_a.default = result.schema._prefault);
	delete result.schema._prefault;
	return ctx.seen.get(schema).schema;
}
function encodeJSONPointerSegment(segment) {
	return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
function extractDefs(ctx, schema) {
	const root = ctx.seen.get(schema);
	if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
	if (ctx.external && ctx.sharedDefsExtractedFor === ctx.external) return;
	const idToSchema = /* @__PURE__ */ new Map();
	for (const entry of ctx.seen.entries()) {
		const id = ctx.metadataRegistry.get(entry[0])?.id;
		if (id) {
			const existing = idToSchema.get(id);
			if (existing && existing !== entry[0]) throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
			idToSchema.set(id, entry[0]);
		}
	}
	const makeURI = (entry) => {
		const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
		if (ctx.external) {
			const externalId = ctx.external.registry.get(entry[0])?.id;
			const uriGenerator = ctx.external.uri ?? ((id) => id);
			if (externalId) return { ref: uriGenerator(externalId) };
			const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
			entry[1].defId = id;
			return {
				defId: id,
				ref: `${uriGenerator("__shared")}#/${defsSegment}/${encodeJSONPointerSegment(id)}`
			};
		}
		const uriPrefix = `#`;
		const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
		if (entry[1] === root && !entry[1].schema.id) return { ref: uriPrefix };
		const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
		return {
			defId,
			ref: defUriPrefix + encodeJSONPointerSegment(defId)
		};
	};
	const extractToDef = (entry) => {
		if (entry[1].schema.$ref) return;
		const seen = entry[1];
		const { ref, defId } = makeURI(entry);
		seen.def = { ...seen.schema };
		if (defId) seen.defId = defId;
		const schema = seen.schema;
		for (const key in schema) delete schema[key];
		schema.$ref = ref;
	};
	if (ctx.cycles === "throw") for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (seen.cycle) throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
	}
	for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (schema === entry[0]) {
			extractToDef(entry);
			continue;
		}
		if (ctx.external) {
			const ext = ctx.external.registry.get(entry[0])?.id;
			if (schema !== entry[0] && ext) {
				extractToDef(entry);
				continue;
			}
		}
		if (ctx.metadataRegistry.get(entry[0])?.id) {
			extractToDef(entry);
			continue;
		}
		if (seen.cycle) {
			extractToDef(entry);
			continue;
		}
		if (seen.count > 1) {
			if (ctx.reused === "ref") {
				extractToDef(entry);
				continue;
			}
		}
	}
	if (ctx.external) ctx.sharedDefsExtractedFor = ctx.external;
}
/** Rewrites `anyOf: [{type: "a"}, {type: "b"}]` to `type: ["a", "b"]`, which every JSON Schema draft treats as equivalent and most consumers render far better for the nullable case. Only branches that are a bare type assertion qualify — anything carrying a constraint, `$ref`, `const` or metadata is left alone. Runs after `flattenRef`, so a branch an override decorated or `$defs` extraction turned into a `$ref` is no longer bare and correctly stays in `anyOf`. `oneOf` is excluded: `integer` and `number` overlap, so "exactly one" and "at least one" are not the same there. OpenAPI 3.0 is excluded: its `type` must be a single string. */
function compactTypeUnion(schema) {
	const options = schema.anyOf;
	if (!Array.isArray(options) || options.length === 0 || schema.type !== void 0) return;
	const types = [];
	for (const option of options) {
		if (!option || typeof option !== "object") return;
		compactTypeUnion(option);
		const keys = Object.keys(option);
		if (keys.length !== 1 || keys[0] !== "type") return;
		const type = option.type;
		for (const member of Array.isArray(type) ? type : [type]) {
			if (typeof member !== "string") return;
			if (!types.includes(member)) types.push(member);
		}
	}
	delete schema.anyOf;
	schema.type = types.length === 1 ? types[0] : types;
}
/** Keywords `foldIntersection` knows how to combine. Anything else — `$ref`, `patternProperties`,
* an annotation like `description` — makes a member unfoldable, so a constraint this does not
* understand leaves the `allOf` alone instead of being silently dropped or misattributed. */
const FOLDABLE_KEYS = /* @__PURE__ */ new Set([
	"type",
	"properties",
	"required",
	"additionalProperties"
]);
const UNION_KEYS = ["oneOf", "anyOf"];
/** A member's constraint on a key it does not declare itself. A `catchall` states one; `false`, an absent `additionalProperties`, and the empty schema a loose object emits state nothing. */
function undeclaredConstraint(member) {
	const extra = member.additionalProperties;
	if (extra === void 0 || extra === false || typeof extra !== "object" || extra === null) return null;
	return Object.keys(extra).length ? extra : null;
}
/** Combines object members into the single object they describe together, or returns `null` if any of them carries a keyword outside {@link FOLDABLE_KEYS}. */
function foldObjects(members) {
	const objects = [];
	for (const member of members) {
		if (typeof member !== "object" || member.type !== "object") return null;
		for (const key in member) if (!FOLDABLE_KEYS.has(key)) return null;
		objects.push(member);
	}
	const properties = {};
	const required = /* @__PURE__ */ new Set();
	for (const object of objects) {
		for (const key in object.properties) {
			if (Object.prototype.hasOwnProperty.call(properties, key)) continue;
			const parts = [];
			for (const other of objects) {
				const part = other.properties?.[key] ?? undeclaredConstraint(other);
				if (part === null || part === void 0) continue;
				if (!parts.some((seen) => JSON.stringify(seen) === JSON.stringify(part))) parts.push(part);
			}
			assignProp(properties, key, parts.length === 1 ? parts[0] : foldObjects(parts) ?? { allOf: parts });
		}
		for (const key of object.required ?? []) required.add(key);
	}
	const folded = {
		type: "object",
		properties
	};
	if (required.size) folded.required = [...required];
	if (objects.every((object) => object.additionalProperties === false)) folded.additionalProperties = false;
	else {
		const constraints = [];
		for (const object of objects) {
			const constraint = undeclaredConstraint(object);
			if (constraint && !constraints.some((seen) => JSON.stringify(seen) === JSON.stringify(constraint))) constraints.push(constraint);
		}
		if (constraints.length === 1) folded.additionalProperties = constraints[0];
		else if (constraints.length > 1) folded.additionalProperties = { allOf: constraints };
	}
	return folded;
}
/** `additionalProperties` in an `allOf` member sees only that member's own `properties`, so two
* closed object members reject each other's keys and the schema validates nothing. Zod's parser
* pools the key sets instead — `handleIntersectionResults` reports a key as unrecognized only when
* *every* side rejects it — so the emitted schema has to pool them too, and folding the members
* into one object is the encoding that says so on every target.
*
* This runs from `finalize`, after `extractDefs`, which is what keeps it clear of the `$ref`
* machinery: a member extracted into `$defs` is already a `$ref` by now and declines to fold, so it
* keeps its reference and its own closedness rather than being inlined as a stale copy. */
function foldIntersection(json) {
	const allOf = json.allOf;
	if (!Array.isArray(allOf) || allOf.length < 2) return;
	for (const key of FOLDABLE_KEYS) if (key in json) return;
	const unions = allOf.filter((m) => UNION_KEYS.some((k) => Array.isArray(m[k])));
	let folded = null;
	if (!unions.length) folded = foldObjects(allOf);
	else {
		const union = unions[0];
		const keyword = UNION_KEYS.find((k) => Array.isArray(union[k]));
		if (Object.keys(union).length !== 1) return;
		const rest = allOf.filter((m) => m !== union);
		const branches = union[keyword].map((branch) => foldObjects([...rest, branch]));
		if (branches.some((b) => !b)) return;
		folded = { [keyword]: branches };
	}
	if (!folded) return;
	delete json.allOf;
	assignProps(json, folded);
}
function finalize(ctx, schema) {
	const root = ctx.seen.get(schema);
	if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
	const flattenRef = (zodSchema) => {
		const seen = ctx.seen.get(zodSchema);
		if (seen.ref === null) return;
		const schema = seen.def ?? seen.schema;
		const _cached = { ...schema };
		const ref = seen.ref;
		seen.ref = null;
		if (ref) {
			flattenRef(ref);
			const refSeen = ctx.seen.get(ref);
			const refSchema = refSeen.schema;
			if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
				schema.allOf = schema.allOf ?? [];
				schema.allOf.push(refSchema);
			} else assignProps(schema, refSchema);
			assignProps(schema, _cached);
			if (zodSchema._zod.parent === ref) for (const key in schema) {
				if (key === "$ref" || key === "allOf") continue;
				if (!(key in _cached)) delete schema[key];
			}
			if (refSchema.$ref && refSeen.def) for (const key in schema) {
				if (key === "$ref" || key === "allOf") continue;
				if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) delete schema[key];
			}
		}
		const parent = zodSchema._zod.parent;
		if (parent && parent !== ref) {
			flattenRef(parent);
			const parentSeen = ctx.seen.get(parent);
			if (parentSeen?.schema.$ref) {
				schema.$ref = parentSeen.schema.$ref;
				if (parentSeen.def) for (const key in schema) {
					if (key === "$ref" || key === "allOf") continue;
					if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) delete schema[key];
				}
			}
		}
		ctx.override({
			zodSchema,
			jsonSchema: schema,
			path: seen.path ?? []
		});
	};
	if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
		for (const entry of [...ctx.seen.entries()].reverse()) flattenRef(entry[0]);
		if (ctx.target !== "openapi-3.0") for (const entry of ctx.seen.entries()) compactTypeUnion(entry[1].def ?? entry[1].schema);
		for (const rewrite of ctx.deferred) rewrite();
		if (ctx.intersections.length) {
			const carriers = /* @__PURE__ */ new Map();
			for (const seen of ctx.seen.values()) for (const json of [seen.schema, seen.def]) {
				const allOf = json?.allOf;
				if (!Array.isArray(allOf)) continue;
				const existing = carriers.get(allOf);
				if (existing) existing.push(json);
				else carriers.set(allOf, [json]);
			}
			for (const allOf of ctx.intersections) for (const json of carriers.get(allOf) ?? []) foldIntersection(json);
		}
	}
	const result = {};
	if (ctx.target === "draft-2020-12") result.$schema = "https://json-schema.org/draft/2020-12/schema";
	else if (ctx.target === "draft-07") result.$schema = "http://json-schema.org/draft-07/schema#";
	else if (ctx.target === "draft-04") result.$schema = "http://json-schema.org/draft-04/schema#";
	else if (ctx.target === "openapi-3.0") {}
	if (ctx.external?.uri) {
		const id = ctx.external.registry.get(schema)?.id;
		if (!id) throw new Error("Schema is missing an `id` property");
		result.$id = ctx.external.uri(id);
	}
	assignProps(result, root.defId ? root.schema : root.def ?? root.schema);
	const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
	if (rootMetaId !== void 0 && result.id === rootMetaId) delete result.id;
	const defs = ctx.external?.defs ?? {};
	if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (seen.def && seen.defId) {
			if (seen.def.id === seen.defId) delete seen.def.id;
			assignProp(defs, seen.defId, seen.def);
		}
	}
	if (ctx.external) ctx.sharedEmitDoneFor = ctx.external;
	if (ctx.external) {} else if (Object.keys(defs).length > 0) {
		if (ctx.target === "draft-2020-12") result.$defs = defs;
		else result.definitions = defs;
	}
	try {
		const finalized = JSON.parse(JSON.stringify(result));
		Object.defineProperty(finalized, "~standard", {
			value: {
				...schema["~standard"],
				jsonSchema: {
					input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
					output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
				}
			},
			enumerable: false,
			writable: false
		});
		return finalized;
	} catch (_err) {
		throw new Error("Error converting schema to JSON.");
	}
}
function isTransforming(_schema, _ctx) {
	const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
	if (ctx.seen.has(_schema)) return false;
	ctx.seen.add(_schema);
	const def = _schema._zod.def;
	if (def.type === "transform") return true;
	if (def.type === "array") return isTransforming(def.element, ctx);
	if (def.type === "set") return isTransforming(def.valueType, ctx);
	if (def.type === "lazy") return isTransforming(def.getter(), ctx);
	if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault" || def.type === "catch") return isTransforming(def.innerType, ctx);
	if (def.type === "intersection") return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
	if (def.type === "record" || def.type === "map") return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
	if (def.type === "pipe") {
		if (_schema._zod.traits.has("$ZodCodec")) return true;
		return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
	}
	if (def.type === "object") {
		for (const key in def.shape) if (isTransforming(def.shape[key], ctx)) return true;
		return false;
	}
	if (def.type === "union") {
		for (const option of def.options) if (isTransforming(option, ctx)) return true;
		return false;
	}
	if (def.type === "tuple") {
		for (const item of def.items) if (isTransforming(item, ctx)) return true;
		if (def.rest && isTransforming(def.rest, ctx)) return true;
		return false;
	}
	return false;
}
/**
* Creates a toJSONSchema method for a schema instance.
* This encapsulates the logic of initializing context, processing, extracting defs, and finalizing.
*/
const createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
	const ctx = initializeContext({
		...params,
		processors
	});
	process(schema, ctx);
	extractDefs(ctx, schema);
	return finalize(ctx, schema);
};
const createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
	const { libraryOptions, target } = params ?? {};
	const ctx = initializeContext({
		...libraryOptions ?? {},
		target,
		io,
		processors
	});
	process(schema, ctx);
	extractDefs(ctx, schema);
	return finalize(ctx, schema);
};
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/core/json-schema-processors.js
const formatMap = {
	guid: "uuid",
	url: "uri",
	datetime: "date-time",
	json_string: "json-string",
	regex: ""
};
const stringProcessor = (schema, ctx, _json, _params) => {
	const json = _json;
	json.type = "string";
	const { minimum, maximum, format, patterns, contentEncoding, laxFormat } = schema._zod.bag;
	if (typeof minimum === "number") json.minLength = minimum;
	if (typeof maximum === "number") json.maxLength = maximum;
	if (format) {
		json.format = formatMap[format] ?? format;
		if (json.format === "") delete json.format;
		if (format === "time" || laxFormat) delete json.format;
	}
	if (contentEncoding) json.contentEncoding = contentEncoding;
	if (patterns && patterns.size > 0) {
		const patternList = [...patterns];
		if (patternList.length === 1) json.pattern = patternList[0].source;
		else if (patternList.length > 1) json.allOf = [...patternList.map((regex) => ({
			...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
			pattern: regex.source
		}))];
	}
};
const enumProcessor = (schema, _ctx, json, _params) => {
	const def = schema._zod.def;
	const values = getEnumValues(def.entries);
	if (values.length === 0) {
		json.not = {};
		return;
	}
	if (values.every((v) => typeof v === "number")) json.type = "number";
	if (values.every((v) => typeof v === "string")) json.type = "string";
	json.enum = values;
};
const customProcessor = (schema, ctx, json, params) => {
	handleUnrepresentable(schema, ctx, json, params, "Custom types cannot be represented in JSON Schema");
};
const transformProcessor = (schema, ctx, json, params) => {
	handleUnrepresentable(schema, ctx, json, params, "Transforms cannot be represented in JSON Schema");
};
const arrayProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	const { minimum, maximum } = schema._zod.bag;
	if (typeof minimum === "number") json.minItems = minimum;
	if (typeof maximum === "number") json.maxItems = maximum;
	json.type = "array";
	json.items = process(def.element, ctx, {
		...params,
		path: [...params.path, "items"]
	});
};
function inputOptin(schema) {
	const def = schema._zod.def;
	if (def.type === "pipe" && def.in._zod.traits.has("$ZodTransform")) return inputOptin(def.out);
	if (def.type === "catch") return inputOptin(def.innerType);
	return schema._zod.optin;
}
const unionProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const isExclusive = def.inclusive === false;
	const options = def.options.map((x, i) => process(x, ctx, {
		...params,
		path: [
			...params.path,
			isExclusive ? "oneOf" : "anyOf",
			i
		]
	}));
	if (isExclusive) json.oneOf = options;
	else json.anyOf = options;
};
const intersectionProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const a = process(def.left, ctx, {
		...params,
		path: [
			...params.path,
			"allOf",
			0
		]
	});
	const b = process(def.right, ctx, {
		...params,
		path: [
			...params.path,
			"allOf",
			1
		]
	});
	const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
	const allOf = [...isSimpleIntersection(a) ? a.allOf : [a], ...isSimpleIntersection(b) ? b.allOf : [b]];
	json.allOf = allOf;
	ctx.intersections.push(allOf);
};
/** JSON object keys are always strings, so a numeric record key schema is re-expressed over the
* numeric-string form the record parser matches. Deferred to `finalize`, after the flatten: a key
* behind a wrapper only carries its own `type` before then, and a union key only has its branches.
*
* A numeric bound cannot apply to a property name, so `minimum` and its siblings are dropped rather
* than carried over: keeping them beside `type: "string"` reproduces the match-nothing schema this
* exists to fix. A key that carries one therefore emits wider than the record parses — `z.record(z.number().min(5), V)`
* accepts `"3"` — which is the deliberate trade, since throwing on it would reject an ordinary schema
* outright. */
function stringifyKeyNames(bySchema, json, visited) {
	if (json.$ref) {
		if (visited.has(json)) return json;
		visited.add(json);
		const def = bySchema.get(json)?.def;
		if (!def) return json;
		const inlined = stringifyKeyNames(bySchema, def, visited);
		return inlined === def ? json : inlined;
	}
	for (const keyword of ["anyOf", "oneOf"]) {
		const branches = json[keyword];
		if (!Array.isArray(branches)) continue;
		const mapped = branches.map((branch) => stringifyKeyNames(bySchema, branch, visited));
		if (mapped.some((branch, i) => branch !== branches[i])) json = {
			...json,
			[keyword]: mapped
		};
	}
	const types = Array.isArray(json.type) ? json.type : [json.type];
	const numericType = !types.includes("string") && types.some((t) => t === "number" || t === "integer");
	const values = json.enum ?? (json.const !== void 0 ? [json.const] : void 0);
	if (!numericType && !values?.some((v) => typeof v === "number")) return json;
	const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf, format, id, ...rest } = json;
	if (rest.enum) rest.enum = rest.enum.map((v) => typeof v === "number" ? String(v) : v);
	else if (typeof rest.const === "number") rest.const = String(rest.const);
	if (!numericType) return rest;
	rest.type = "string";
	if (!values) rest.pattern = (types.includes("number") ? number : integer).source;
	return rest;
}
/** Every record of one conversion, so the carriers are found in a single pass rather than once per record. */
const pendingRecords = /* @__PURE__ */ new WeakMap();
function rewriteKeyNames(ctx) {
	const bySchema = /* @__PURE__ */ new Map();
	for (const entry of ctx.seen.values()) if (entry.def && !bySchema.has(entry.schema)) bySchema.set(entry.schema, entry);
	const rewrites = /* @__PURE__ */ new Map();
	for (const record of pendingRecords.get(ctx) ?? []) {
		const seen = ctx.seen.get(record);
		const names = (seen?.def ?? seen?.schema)?.propertyNames;
		if (!names || names === true || rewrites.has(names)) continue;
		const rewritten = stringifyKeyNames(bySchema, names, /* @__PURE__ */ new Set());
		if (rewritten !== names) rewrites.set(names, rewritten);
	}
	if (!rewrites.size) return;
	for (const entry of ctx.seen.values()) for (const carrier of [entry.schema, entry.def]) {
		const rewritten = carrier && rewrites.get(carrier.propertyNames);
		if (rewritten) carrier.propertyNames = rewritten;
	}
}
const recordProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	json.type = "object";
	const keyType = def.keyType;
	const patterns = keyType._zod.bag?.patterns;
	if (def.mode === "loose" && patterns && patterns.size > 0) {
		const valueSchema = process(def.valueType, ctx, {
			...params,
			path: [
				...params.path,
				"patternProperties",
				"*"
			]
		});
		json.patternProperties = {};
		for (const pattern of patterns) assignProp(json.patternProperties, pattern.source, valueSchema);
	} else {
		if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
			json.propertyNames = process(def.keyType, ctx, {
				...params,
				path: [...params.path, "propertyNames"]
			});
			let pending = pendingRecords.get(ctx);
			if (!pending) {
				pending = [];
				pendingRecords.set(ctx, pending);
				ctx.deferred.push(() => rewriteKeyNames(ctx));
			}
			pending.push(schema);
		}
		json.additionalProperties = process(def.valueType, ctx, {
			...params,
			path: [...params.path, "additionalProperties"]
		});
	}
	const keyValues = keyType._zod.values;
	const omittableOnInput = ctx.io === "input" && inputOptin(def.valueType) !== void 0;
	if (keyValues && !def.partial && !omittableOnInput) {
		const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
		if (validKeyValues.length > 0) json.required = validKeyValues.map(String);
	}
};
const nullableProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const inner = process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	if (ctx.target === "openapi-3.0") {
		seen.ref = def.innerType;
		json.nullable = true;
	} else json.anyOf = [inner, { type: "null" }];
};
const nonoptionalProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
};
/** Round-trips a default value through JSON so the emitted schema is guaranteed to be valid JSON.
* A BigInt has no reliable encoding, so it goes through `unrepresentable` like any other
* unrepresentable value. Returns a sentinel when the caller must not write a default of its own. */
const UNREPRESENTABLE_DEFAULT = Symbol();
function serializeDefaultValue(value, schema, ctx, json, params) {
	let unrepresentable = false;
	const serialized = JSON.stringify(value, (_, val) => {
		if (typeof val !== "bigint") return val;
		unrepresentable = true;
		return null;
	});
	if (!unrepresentable) return JSON.parse(serialized);
	handleUnrepresentable(schema, ctx, json, params, "BigInt defaults cannot be represented in JSON Schema");
	return UNREPRESENTABLE_DEFAULT;
}
const defaultProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
	if (value !== UNREPRESENTABLE_DEFAULT) json.default = value;
};
const prefaultProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	if (ctx.io !== "input") return;
	const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
	if (value !== UNREPRESENTABLE_DEFAULT) json._prefault = value;
};
const catchProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	let catchValue;
	try {
		catchValue = def.catchValue(void 0);
	} catch {
		handleUnrepresentable(schema, ctx, json, params, "Dynamic catch values are not supported in JSON Schema");
		return;
	}
	json.default = catchValue;
};
const pipeProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	const inIsTransform = def.in._zod.traits.has("$ZodTransform");
	const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
	process(innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = innerType;
};
const readonlyProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	json.readOnly = true;
};
const optionalProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
};
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/classic/errors.js
const _installedErrorProtos = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
function _lazyMethod(proto, key, make) {
	Object.defineProperty(proto, key, {
		configurable: true,
		enumerable: false,
		get() {
			const value = make(this);
			Object.defineProperty(this, key, {
				value,
				configurable: true,
				writable: true
			});
			return value;
		},
		set(value) {
			Object.defineProperty(this, key, {
				value,
				configurable: true,
				writable: true
			});
		}
	});
}
const initializer = (inst, issues) => {
	$ZodError.init(inst, issues);
	inst.name = "ZodError";
	const proto = Object.getPrototypeOf(inst);
	if (_installedErrorProtos.has(proto)) return;
	_installedErrorProtos.add(proto);
	_lazyMethod(proto, "format", (self) => (mapper) => formatError(self, mapper));
	_lazyMethod(proto, "flatten", (self) => (mapper) => flattenError(self, mapper));
	_lazyMethod(proto, "addIssue", (self) => (issue) => {
		self.issues.push(issue);
		self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
	});
	_lazyMethod(proto, "addIssues", (self) => (issues) => {
		self.issues.push(...issues);
		self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
	});
	Object.defineProperty(proto, "isEmpty", {
		configurable: true,
		enumerable: false,
		get() {
			return this.issues.length === 0;
		}
	});
};
const ZodRealError = /*@__PURE__*/ $constructor("ZodError", initializer, void 0, { Parent: Error });
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/classic/parse.js
const parse = /* @__PURE__ */ _parse(ZodRealError);
const parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
const safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
const safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
const encode = /* @__PURE__ */ _encode(ZodRealError);
const decode = /* @__PURE__ */ _decode(ZodRealError);
const encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
const decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
const safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
const safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
const safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
const safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
//#endregion
//#region node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/classic/schemas.js
function _ensureDefaultLocale() {
	if (!globalConfig.localeError) config(en_default());
}
function _ensureDefaultMemoizer() {
	if (!globalConfig.memoizer) config({ memoizer: memoizer() });
}
const ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
	_ensureDefaultLocale();
	$ZodType.init(inst, def);
	inst.def = def;
	inst.type = def.type;
	return inst;
}, {
	check(...chks) {
		const def = this.def;
		return this.clone(mergeDefs(def, { checks: [...def.checks ?? [], ...chks.map((ch) => typeof ch === "function" ? { _zod: {
			check: ch,
			def: { check: "custom" },
			onattach: []
		} } : ch)] }), { parent: true });
	},
	with(...chks) {
		return this.check(...chks);
	},
	clone(def, params) {
		return clone(this, def, params);
	},
	brand() {
		return this;
	},
	register(reg, meta) {
		reg.add(this, meta);
		return this;
	},
	refine(check, params) {
		return this.check(refine(check, params));
	},
	superRefine(refinement, params) {
		return this.check(superRefine(refinement, params));
	},
	overwrite(fn) {
		return this.check(/* @__PURE__ */ _overwrite(fn));
	},
	optional() {
		return optional(this);
	},
	exactOptional() {
		return exactOptional(this);
	},
	nullable() {
		return nullable(this);
	},
	nullish() {
		return optional(nullable(this));
	},
	nonoptional(params) {
		return nonoptional(this, params);
	},
	array() {
		return array(this);
	},
	or(arg) {
		return union([this, arg]);
	},
	and(arg) {
		return intersection(this, arg);
	},
	transform(tx) {
		return pipe(this, transform(tx));
	},
	default(d) {
		return _default(this, d);
	},
	prefault(d) {
		return prefault(this, d);
	},
	catch(params) {
		return _catch(this, params);
	},
	pipe(target) {
		return pipe(this, target);
	},
	readonly() {
		return readonly(this);
	},
	describe(description) {
		const cl = this.clone();
		globalRegistry.add(cl, { description });
		return cl;
	},
	meta(...args) {
		if (args.length === 0) return globalRegistry.get(this);
		const cl = this.clone();
		globalRegistry.add(cl, args[0]);
		return cl;
	},
	isOptional() {
		return this.safeParse(void 0).success;
	},
	isNullable() {
		return this.safeParse(null).success;
	},
	apply(fn, ...args) {
		return args.length === 0 ? fn(this) : fn(this, ...args);
	},
	get "~standard"() {
		return hide(this, "~standard", {
			...standardProps(this),
			jsonSchema: {
				input: createStandardJSONSchemaMethod(this, "input"),
				output: createStandardJSONSchemaMethod(this, "output")
			}
		});
	},
	set "~standard"(value) {
		own(this, "~standard", value);
	},
	parse: function _parse(data, params) {
		return parse(this, data, params, { callee: _parse });
	},
	parseAsync: async function _parseAsync(data, params) {
		return await parseAsync(this, data, params, { callee: _parseAsync });
	},
	safeParse(data, params) {
		return safeParse(this, data, params);
	},
	async safeParseAsync(data, params) {
		return safeParseAsync(this, data, params);
	},
	get spa() {
		return this?.safeParseAsync;
	},
	set spa(value) {
		own(this, "spa", value);
	},
	encode: function _encode(data, params) {
		return encode(this, data, params, { callee: _encode });
	},
	decode: function _decode(data, params) {
		return decode(this, data, params, { callee: _decode });
	},
	encodeAsync: async function _encodeAsync(data, params) {
		return await encodeAsync(this, data, params, { callee: _encodeAsync });
	},
	decodeAsync: async function _decodeAsync(data, params) {
		return await decodeAsync(this, data, params, { callee: _decodeAsync });
	},
	safeEncode(data, params) {
		return safeEncode(this, data, params);
	},
	safeDecode(data, params) {
		return safeDecode(this, data, params);
	},
	async safeEncodeAsync(data, params) {
		return safeEncodeAsync(this, data, params);
	},
	async safeDecodeAsync(data, params) {
		return safeDecodeAsync(this, data, params);
	},
	toJSONSchema(params) {
		return createToJSONSchemaMethod(this, {})(params);
	},
	get description() {
		return globalRegistry.get(this)?.description;
	},
	get _def() {
		return this._zod.def;
	}
});
/** @internal */
const _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
	$ZodString.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
	const bag = inst._zod.bag;
	inst.format = bag.format ?? null;
	inst.minLength = bag.minimum ?? null;
	inst.maxLength = bag.maximum ?? null;
}, {
	regex(...args) {
		return this.check(/* @__PURE__ */ _regex(...args));
	},
	includes(...args) {
		return this.check(/* @__PURE__ */ _includes(...args));
	},
	startsWith(...args) {
		return this.check(/* @__PURE__ */ _startsWith(...args));
	},
	endsWith(...args) {
		return this.check(/* @__PURE__ */ _endsWith(...args));
	},
	min(...args) {
		return this.check(/* @__PURE__ */ _minLength(...args));
	},
	max(...args) {
		return this.check(/* @__PURE__ */ _maxLength(...args));
	},
	length(...args) {
		return this.check(/* @__PURE__ */ _length(...args));
	},
	nonempty(...args) {
		return this.check(/* @__PURE__ */ _minLength(1, ...args));
	},
	lowercase(params) {
		return this.check(/* @__PURE__ */ _lowercase(params));
	},
	uppercase(params) {
		return this.check(/* @__PURE__ */ _uppercase(params));
	},
	trim() {
		return this.check(/* @__PURE__ */ _trim());
	},
	normalize(...args) {
		return this.check(/* @__PURE__ */ _normalize(...args));
	},
	toLowerCase() {
		return this.check(/* @__PURE__ */ _toLowerCase());
	},
	toUpperCase() {
		return this.check(/* @__PURE__ */ _toUpperCase());
	},
	slugify() {
		return this.check(/* @__PURE__ */ _slugify());
	}
});
const ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
	$ZodString.init(inst, def);
	_ZodString.init(inst, def);
}, {
	email(params) {
		return this.check(/* @__PURE__ */ _email(ZodEmail, params));
	},
	url(params) {
		return this.check(/* @__PURE__ */ _url(ZodURL, params));
	},
	jwt(params) {
		return this.check(/* @__PURE__ */ _jwt(ZodJWT, params));
	},
	emoji(params) {
		return this.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
	},
	guid(params) {
		return this.check(/* @__PURE__ */ _guid(ZodGUID, params));
	},
	uuid(params) {
		return this.check(/* @__PURE__ */ _uuid(ZodUUID, params));
	},
	uuidv4(params) {
		return this.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
	},
	uuidv6(params) {
		return this.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
	},
	uuidv7(params) {
		return this.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
	},
	nanoid(params) {
		return this.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
	},
	cuid(params) {
		return this.check(/* @__PURE__ */ _cuid(ZodCUID, params));
	},
	cuid2(params) {
		return this.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
	},
	ulid(params) {
		return this.check(/* @__PURE__ */ _ulid(ZodULID, params));
	},
	base64(params) {
		return this.check(/* @__PURE__ */ _base64(ZodBase64, params));
	},
	base64url(params) {
		return this.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
	},
	xid(params) {
		return this.check(/* @__PURE__ */ _xid(ZodXID, params));
	},
	ksuid(params) {
		return this.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
	},
	ipv4(params) {
		return this.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
	},
	ipv6(params) {
		return this.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
	},
	cidrv4(params) {
		return this.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
	},
	cidrv6(params) {
		return this.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
	},
	e164(params) {
		return this.check(/* @__PURE__ */ _e164(ZodE164, params));
	},
	datetime(params) {
		return this.check(/* @__PURE__ */ _isoDateTime(ZodISODateTime, params));
	},
	date(params) {
		return this.check(/* @__PURE__ */ _isoDate(ZodISODate, params));
	},
	time(params) {
		return this.check(/* @__PURE__ */ _isoTime(ZodISOTime, params));
	},
	duration(params) {
		return this.check(/* @__PURE__ */ _isoDuration(ZodISODuration, params));
	}
});
function string(params) {
	return /* @__PURE__ */ _string(ZodString, params);
}
const ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	_ZodString.init(inst, def);
});
const ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
	$ZodISODateTime.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
	$ZodISODate.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
	$ZodISOTime.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
	$ZodISODuration.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
	$ZodEmail.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
	$ZodGUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
	$ZodUUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
	$ZodURL.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
	$ZodEmoji.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
	$ZodNanoID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link ZodCUID2} instead.
* See https://github.com/paralleldrive/cuid.
*/
const ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
	$ZodCUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
	$ZodCUID2.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
	$ZodULID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
	$ZodXID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
	$ZodKSUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
	$ZodIPv4.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
	$ZodIPv6.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
	$ZodCIDRv4.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
	$ZodCIDRv6.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
	$ZodBase64.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
	$ZodBase64URL.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
	$ZodE164.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
	$ZodJWT.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
	_ensureDefaultMemoizer();
	$ZodArray.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
	inst.element = def.element;
}, {
	min(n, params) {
		return this.check(/* @__PURE__ */ _minLength(n, params));
	},
	nonempty(params) {
		return this.check(/* @__PURE__ */ _minLength(1, params));
	},
	max(n, params) {
		return this.check(/* @__PURE__ */ _maxLength(n, params));
	},
	length(n, params) {
		return this.check(/* @__PURE__ */ _length(n, params));
	},
	unwrap() {
		return this.element;
	}
});
function array(element, params) {
	return /* @__PURE__ */ _array(ZodArray, element, params);
}
const ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
	$ZodUnion.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
	inst.options = def.options;
});
function union(options, params) {
	return new ZodUnion({
		type: "union",
		options,
		...normalizeParams(params)
	});
}
const ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
	$ZodIntersection.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
	return new ZodIntersection({
		type: "intersection",
		left,
		right
	});
}
const ZodRecord = /*@__PURE__*/ $constructor("ZodRecord", (inst, def) => {
	_ensureDefaultMemoizer();
	$ZodRecord.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
	inst.keyType = def.keyType;
	inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
	if (!valueType || !valueType._zod) return new ZodRecord({
		type: "record",
		keyType: string(),
		valueType: keyType,
		...normalizeParams(valueType)
	});
	return new ZodRecord({
		type: "record",
		keyType,
		valueType,
		...normalizeParams(params)
	});
}
const ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
	$ZodEnum.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
	inst.enum = def.entries;
	inst.options = Object.values(def.entries);
	const keys = new Set(Object.keys(def.entries));
	inst.extract = (values, params) => {
		const newEntries = {};
		for (const value of values) if (keys.has(value)) newEntries[value] = def.entries[value];
		else throw new Error(`Key ${value} not found in enum`);
		return new ZodEnum({
			...def,
			checks: [],
			...normalizeParams(params),
			entries: newEntries
		});
	};
	inst.exclude = (values, params) => {
		const newEntries = { ...def.entries };
		for (const value of values) if (keys.has(value)) delete newEntries[value];
		else throw new Error(`Key ${value} not found in enum`);
		return new ZodEnum({
			...def,
			checks: [],
			...normalizeParams(params),
			entries: newEntries
		});
	};
});
function _enum(values, params) {
	const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
	return new ZodEnum({
		type: "enum",
		entries,
		...normalizeParams(params)
	});
}
const ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
	_ensureDefaultMemoizer();
	$ZodTransform.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
	inst._zod.parse = (payload, _ctx) => {
		if (_ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
		payload.addIssue = (issue$1) => {
			if (typeof issue$1 === "string") payload.issues.push(issue(issue$1, payload.value, def));
			else {
				const _issue = issue$1;
				if (_issue.fatal) _issue.continue = false;
				_issue.code ?? (_issue.code = "custom");
				if (!("input" in _issue)) _issue.input = payload.value;
				_issue.inst ?? (_issue.inst = inst);
				payload.issues.push(issue(_issue));
			}
		};
		const output = def.transform(payload.value, payload);
		if (output instanceof Promise) return output.then((output) => {
			payload.value = output;
			return payload;
		});
		payload.value = output;
		return payload;
	};
});
function transform(fn) {
	return new ZodTransform({
		type: "transform",
		transform: fn
	});
}
const ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
	$ZodOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
	return new ZodOptional({
		type: "optional",
		innerType
	});
}
const ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
	$ZodExactOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
	return new ZodExactOptional({
		type: "optional",
		innerType
	});
}
const ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
	$ZodNullable.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
	return new ZodNullable({
		type: "nullable",
		innerType
	});
}
const ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
	$ZodDefault.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
	inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
	return new ZodDefault({
		type: "default",
		innerType,
		get defaultValue() {
			return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
		}
	});
}
const ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
	$ZodPrefault.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
	return new ZodPrefault({
		type: "prefault",
		innerType,
		get defaultValue() {
			return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
		}
	});
}
const ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
	$ZodNonOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
	return new ZodNonOptional({
		type: "nonoptional",
		innerType,
		...normalizeParams(params)
	});
}
const ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
	$ZodCatch.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
	inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
	return new ZodCatch({
		type: "catch",
		innerType,
		catchValue: typeof catchValue === "function" ? catchValue : constantCatch(catchValue)
	});
}
const ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
	$ZodPipe.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
	inst.in = def.in;
	inst.out = def.out;
});
function pipe(in_, out) {
	return new ZodPipe({
		type: "pipe",
		in: in_,
		out
	});
}
const ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
	$ZodReadonly.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
	return new ZodReadonly({
		type: "readonly",
		innerType
	});
}
const ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
	$ZodCustom.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
function refine(fn, _params = {}) {
	return /* @__PURE__ */ _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
	return /* @__PURE__ */ _superRefine(fn, params);
}
//#endregion
//#region lib/types/host/config.js
/**
* Durable-domain schema and stored-document shape for
* dsh-capability-toggle-plugin.
*
* All three override levels live in ONE storage domain rather than a
* session-log event. This is deliberate: `Session.append()` exposes no way to
* mark a non-surface event `ignorable`, and the persistence read path
* (`assertEventsSupported`) refuses to reconstruct any log carrying an event
* type outside the harness's generated `KNOWN_SESSION_EVENT_TYPES` set — an
* out-of-repo plugin event can never be in that set, so a custom
* `capability/toggle` session event would brick the session on reload. The
* domain persists across restarts too, so the session level (keyed by session
* id) keeps its survives-reload guarantee without that risk.
*
* Model-visible ⟺ logged still holds: this state never becomes model text on
* its own. Its only model effect — a capability disappearing from the tool
* schema set or the `<available_skills>` catalog — is emitted and logged by
* their owners (the `request/header` snapshot and tool-skill's catalog
* message), which replay recomputes.
*
* @module dsh-capability-toggle-plugin/host/config
*/
/**
* The storage domain this plugin owns. The backend's unit-name grammar admits
* lowercase identifiers only — no hyphens — so this is not a package-shaped name.
*/
const DOMAIN_NAME = "capability_toggle";
/** One capability's stored stance: only the explicit `on`/`off` are persisted. */
const StanceSchema = _enum(["on", "off"]);
/** One level's stored override map (capability id to explicit stance). */
const OverrideMapSchema = record(string(), StanceSchema);
const CapabilityToggleSpec = defineDomain({
	name: DOMAIN_NAME,
	version: 1,
	global: {
		schema: OverrideMapSchema,
		initial: {}
	},
	tables: {
		projects: domainTable(OverrideMapSchema),
		sessions: domainTable(OverrideMapSchema)
	}
});
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
/**
* The durable override store: one storage domain holding the global,
* per-project, and per-session override maps, with typed reads, writes, and
* change observation. Every write goes through the opened domain so the storage
* layer owns durability and the `domain/changed` commit event; this module never
* touches the backend medium directly.
*
* @module dsh-capability-toggle-plugin/host/store
*/
/**
* Owns this plugin's opened storage domain and exposes level-aware reads and
* writes. One instance per Host plugin activation.
*/
var OverrideStore = class {
	ctx;
	domain;
	/**
	* @param ctx - the Host context, for the domain's change event.
	* @param domain - this plugin's already-opened storage domain.
	*/
	constructor(ctx, domain) {
		this.ctx = ctx;
		this.domain = domain;
	}
	/**
	* Observe committed changes to the stored document.
	* @param callback - invoked after each commit with the resolved next value.
	* @returns the disposer removing this observer.
	*/
	watch(callback) {
		return this.ctx.on("domain/changed", (change) => {
			if (change.domain !== "capability_toggle") return;
			callback(this.read());
		});
	}
	/** @returns the current resolved stored document. */
	read() {
		return {
			global: this.domain.global.get(),
			projects: Object.fromEntries(this.table("projects").entries()),
			sessions: Object.fromEntries(this.table("sessions").entries())
		};
	}
	/**
	* Assemble the three override maps that apply to one session in one project.
	* A missing project/session key contributes an empty map (all `inherit`).
	* @param projectKey - absolute project root, or `''` when none resolved.
	* @param sessionKey - the session id.
	* @returns the layered overrides for resolution.
	*/
	layered(projectKey, sessionKey) {
		return {
			session: this.table("sessions").get(sessionKey) ?? {},
			project: projectKey === "" ? {} : this.table("projects").get(projectKey) ?? {},
			global: this.domain.global.get()
		};
	}
	/**
	* Set one capability's stance at one level, persisting that level's map
	* through the domain. A `state` of `inherit` removes the stored key so the
	* level goes silent.
	* @param selector - which level (and key) to write.
	* @param id - capability switch key.
	* @param state - the new stance; `inherit` clears the stored entry.
	*/
	async set(selector, id, state) {
		await this.writeLevel(selector, (map) => writeMap(map, id, state));
	}
	/**
	* Set several ids to the same stance at one level in a SINGLE domain write.
	* Equivalent to calling {@link set} once per id, but batched: one durable
	* write (one queue slot, one persist, one `domain/changed` broadcast) instead
	* of `ids.length` separate round trips through the domain's write chain. Used
	* by the panel's bulk toolbar action (enable-all / disable-all / clear-all on
	* a filtered tab), where an empty selection is a legal no-op.
	* @param selector - which level (and key) to write.
	* @param ids - the switch keys to set; duplicates are applied in order (the
	*   last occurrence of a given id wins, matching a sequential {@link set}).
	* @param state - the new stance for every id; `inherit` clears the stored entry.
	*/
	async setMany(selector, ids, state) {
		if (ids.length === 0) return;
		await this.writeLevel(selector, (map) => {
			let next = map;
			for (const id of ids) next = writeMap(next, id, state);
			return next;
		});
	}
	/** The table backing one keyed level. */
	table(level) {
		return this.domain.table(level);
	}
	/**
	* Apply `transform` to one level's stored map and persist the result: the
	* global singleton for the global level, a table row for a keyed one.
	* @param selector - which level (and key) to write.
	* @param transform - maps the level's current override map to its next value.
	*/
	async writeLevel(selector, transform) {
		if (selector.level === "global") {
			await this.domain.global.set(transform(this.domain.global.get()));
			return;
		}
		const table = this.table(selector.level === "project" ? "projects" : "sessions");
		const nextMap = transform(table.get(selector.key) ?? {});
		if (Object.keys(nextMap).length === 0) await table.delete(selector.key);
		else await table.put(selector.key, nextMap);
	}
};
/**
* Produce the next override map after setting one id to one stance. An
* `inherit` stance deletes the key; `on`/`off` store it.
* @param map - the current stored map.
* @param id - capability switch key.
* @param state - the new stance.
* @returns a new map (the input is not mutated).
*/
function writeMap(map, id, state) {
	const next = { ...map };
	if (state === "inherit") delete next[id];
	else next[id] = state;
	return next;
}
/**
* The three levels a UI write may address, for input validation. Aliases the
* shared priority order so the writable set and the resolution order can never
* drift apart.
*/
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
* Apply prompt-gate enforcement for one scope: for every disabled prompt switch,
* register the matching empty shadow (section/context) or the runtime
* suppressor. Each returns a Cordis disposer, collected by the caller.
*
* MUST be called on a SCOPED context (never the host root): a same-name section
* or context in the global layer collides with the framework's own registration
* and throws. The caller gates on `scope !== undefined` before invoking.
*
* @param scopedCtx - the agent's scoped context.
* @param descriptors - this scope's promptable inventory.
* @param disabledIds - switch ids resolved to disabled.
* @returns disposers for every shadow/suppressor installed.
*/
function applyPromptGates(scopedCtx, descriptors, disabledIds) {
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
			disposers.push(system.section({
				name: registryName,
				order: spec?.order ?? 0,
				text: ""
			}));
			continue;
		}
		if (d.id.startsWith(CONTEXT_PREFIX)) {
			const registryName = d.id.slice(15);
			const spec = CONTEXT_GATES.find((g) => g.registryName === registryName);
			disposers.push(system.context({
				name: registryName,
				order: spec?.order ?? 100,
				text: ""
			}));
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
* Capability inventory: enumerate the switchable skills, MCP servers (with one
* switch per member tool), and plain tools visible to one agent scope, as the
* descriptor rows the UI lists and the id universe the resolver evaluates
* against.
*
* Three kinds, three sources:
*   - `skill`: `ctx.skills.snapshot({ scope })` — every model-invocable skill
*     summary (name + routing description).
*   - `mcp`:   tools named `mcp__<server>__<rawName>` (the mcp-client public
*     name grammar), grouped by `<server>` into one group row that carries its
*     member tools. Each member gets its OWN switch, and the group's `mcp:<server>`
*     switch is the members' default (see shared/resolve.ts `mcpMemberStance`):
*     MCP tools are opt-in, so a member with nothing set anywhere is disabled.
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
* count on the invoked skill (the loader tool's argument), not on `skill`; every
* other tool counts on its own `tool:<name>` row.
* @param name - the model-facing tool name that ran.
* @param args - that call's arguments (used only for the skill loader).
* @returns the switch id to credit, or undefined when nothing should be.
*/
function attributeCall(name, args) {
	if (name === SKILL_TOOL_NAME) {
		const skillName = args?.name;
		return typeof skillName === "string" && skillName !== "" ? skillId(skillName) : void 0;
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
*   - `mcp` group rows deny member tools whose guidance sections (if any) are
*     not named after the group, so there is nothing deterministic to shadow.
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
		"storageDomain",
		"tools",
		"skills",
		"systemPrompt",
		"webServer",
		"connection"
	],
	/**
	* Members each required service must still expose. A surviving service NAME is
	* not enough: DSH 0.1.7 kept `settings` while dropping the method this plugin
	* called, so a presence-only probe reports a healthy host until the first write.
	*/
	serviceShapes: { storageDomain: ["open"] },
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
	/** The storage domain holding the three-level override document. */
	domainName: DOMAIN_NAME
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
	ctx.logger.info(`active — enforcement binds events [${c.enforcementEvents.join(", ")}] scoped by "${c.scopeRoutingKey}", switches MCP tools by "${c.mcpNameGrammar}" (opt-in: a member with nothing set anywhere is denied), tracks agent lifecycle via [${c.lifecycleEvents.join(", ")}], and persists stances in the "${c.domainName}" storage domain. If a DSH upgrade renames an enforcement event, the affected guard/lock stops matching WITHOUT error (fail-open); if it renames "agent/disposed", per-agent bindings stop being reclaimed (slow memory leak). Grep this line when auditing an upgrade.`);
}
/**
* Verify each required service actually resolves AND still exposes the members
* this plugin calls. `inject` already gates activation on resolution, so a miss
* here means the inject contract itself changed (a required service was
* renamed/removed upstream) — an `error`-level signal, not a mere warning,
* because enforcement is then partially inoperative. Resolution alone cannot
* see a service that kept its name and lost a method, which is exactly how the
* 0.1.7 settings change presented.
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
*     section, and the curated prompt-gate family shadows sections/contexts or
*     installs the runtime-context suppressor (see ./prompt.ts).
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
			for (const sectionName of disabledToolGuidanceSections(descriptors, disabled)) this.disposers.push(this.scopedCtx.systemPrompt.section({
				name: sectionName,
				order: GUIDANCE_SHADOW_ORDER,
				text: ""
			}));
			for (const dispose of applyPromptGates(this.scopedCtx, descriptors, disabled)) this.disposers.push(dispose);
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
		this.bindings.set(agent.session.id, binding);
		await binding.reconcile();
		return binding;
	}
	/**
	* Stop tracking an agent and drop its application (and its minted scope).
	* @param sessionId - the disposed agent's session id.
	*/
	remove(sessionId) {
		const binding = this.bindings.get(sessionId);
		if (binding === void 0) return;
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
	/** Re-apply the current decision to every tracked agent (store changed). */
	async reconcileAll() {
		await Promise.all([...this.bindings.values()].map((b) => b.reconcile()));
	}
};
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
*           listed id in one domain write, and returns the refreshed
*           projection. Backs the panel's bulk-toolbar (enable/disable/clear a
*           filtered tab's visible rows at one level).
*
* This is a Host-owned control channel, not model-visible state, so it lives off
* the session log entirely (see host/config.ts for why the state is not a
* session event). Every write lands in this plugin's storage domain, whose
* commit event drives reconcile on every affected agent.
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
*   - OverrideStore        durable three-level state in one storage domain.
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
* Required services. `storageDomain` backs the durable state, `tools` and
* `skills` are the enforced seams, `systemPrompt` carries the tool-guidance
* section shadow that accompanies a disabled tool, `webServer` carries the
* browser panel channel, and `connection` carries the per-request auth seam the
* panel routes apply themselves.
*/
const inject = [
	"storageDomain",
	"tools",
	"skills",
	"systemPrompt",
	"webServer",
	"connection"
];
/**
* Host plugin body. Every contribution is an effect, so plugin unload (or HMR
* hot-swap) tears down the routes, the domain, and every per-agent application.
* The domain is opened BEFORE any listener is installed: a binding created
* against a not-yet-open domain would read empty overrides and fail open.
* @param ctx - the Host root context.
*/
async function apply(ctx) {
	emitContractBanner(ctx);
	checkRequiredServices(ctx);
	const onDrift = makeWarnOnce(ctx);
	let domain;
	try {
		domain = await ctx.storageDomain.open(CapabilityToggleSpec);
	} catch (error) {
		ctx.logger.error(`capability-toggle could not open its storage domain '${CapabilityToggleSpec.name}': ${messageOf(error)}. Neither the panel nor any switch is available until that medium is readable.`);
		throw error;
	}
	ctx.effect(() => () => domain.close(), "capability-toggle: storage domain");
	const store = new OverrideStore(ctx, domain);
	const center = new ConfirmationCenter();
	const registry = new ControllerRegistry(store, ctx, center, onDrift);
	ctx.effect(() => installHttp(ctx, store, registry, center), "capability-toggle: http routes");
	ctx.effect(() => () => center.dispose(), "capability-toggle: confirmation center");
	ctx.effect(() => store.watch(() => {
		registry.reconcileAll().catch((error) => {
			ctx.logger.warn(`capability-toggle reconcile failed: ${messageOf(error)}`);
		});
	}), "capability-toggle: domain observer");
	ctx.on("agent/created", ({ agent }) => {
		registry.add(agent).catch((error) => {
			ctx.logger.warn(`capability-toggle failed to bind agent: ${messageOf(error)}`);
		});
	});
	ctx.on("agent/disposed", ({ agent }) => {
		registry.remove(agent.session.id);
	});
}
/** Extract a log-safe message from an unknown error. */
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
export { apply, inject, name };

//# sourceMappingURL=index.js.map