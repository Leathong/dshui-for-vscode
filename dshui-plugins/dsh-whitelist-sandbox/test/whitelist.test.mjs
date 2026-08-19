/**
 * Minimal behavior tests for dsh-whitelist-sandbox: the whitelist root is
 * writable through both enforcement sides, non-whitelisted paths stay denied,
 * the argv injection preserves the stock wrap's shape, and the security guard
 * rejects roots that would make the DSH policy store writable.
 *
 * Run from the workspace root:  node --test dshui-plugins/dsh-whitelist-sandbox/test/whitelist.test.mjs
 * (or `npm test` inside the plugin directory).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { canonicalPath } from "@deepseek-ai/dsh-sandbox";
import { LocalSandboxProvider } from "@deepseek-ai/dsh-sandbox-local";
import { SandboxBashExecutor } from "@deepseek-ai/dsh-bash-sandbox";
import { SandboxedFileSystem } from "@deepseek-ai/dsh-fs-sandbox";
import { FsError } from "@deepseek-ai/dsh-fs";
import {
  WhitelistBashExecutor,
  WhitelistFileSystem,
  WhitelistRoots,
  assertSafeWhitelistRoots,
  canonicalizeExtraRoots,
  injectExtraRootGrants,
} from "../lib/index.js";

const FAKE_HOME = join(homedir(), ".dsh-wl-fake-home");
const FAKE_SETTINGS = join(FAKE_HOME, "settings.yaml");

function tempBase() {
  return mkdtempSync(join(tmpdir(), "dsh-wl-test-"));
}

function rootsSource(logger, initial = []) {
  const source = new WhitelistRoots(logger, { settingsPath: FAKE_SETTINGS, dshHome: FAKE_HOME });
  source.apply(initial);
  return source;
}

// ── argv injection (pure) ──────────────────────────────────────────────────

test("injectExtraRootGrants: seatbelt profile gains a subpath allow, command intact", () => {
  const base = tempBase();
  try {
    const argv = ["sandbox-exec", "-p", '(version 1) (allow default) (deny file-write*) (allow file-write* (subpath "/private/tmp"))', "--", "bash", "-c", "echo hi"];
    const out = injectExtraRootGrants(argv, [base]);
    assert.ok(out[2].includes(`(allow file-write* (subpath "${base}"))`), "whitelist subpath should be allowed");
    assert.equal(out[0], "sandbox-exec");
    assert.deepEqual(out.slice(3), ["--", "bash", "-c", "echo hi"], "command part untouched");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("injectExtraRootGrants: bwrap gains --bind pairs before the separator", () => {
  const base = tempBase();
  try {
    const argv = ["bwrap", "--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "--die-with-parent", "--tmpfs", "/tmp", "--bind", "/ws", "/ws", "--", "bash", "-c", "echo hi"];
    const out = injectExtraRootGrants(argv, [base]);
    const sepIndex = out.indexOf("--");
    const flags = out.slice(0, sepIndex);
    const bound = flags.some((arg, i) => arg === "--bind" && flags[i + 1] === base && flags[i + 2] === base);
    assert.ok(bound, "extra root should be --bind mounted");
    assert.deepEqual(out.slice(sepIndex), ["--", "bash", "-c", "echo hi"], "command part untouched");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("injectExtraRootGrants: landlock launcher gains --rw root", () => {
  const base = tempBase();
  try {
    const argv = ["/x/landlock-run", "--ro", "/", "--rw", "/tmp", "--rw", "/ws", "--", "bash", "-c", "echo hi"];
    const out = injectExtraRootGrants(argv, [base]);
    const sepIndex = out.indexOf("--");
    const flags = out.slice(1, sepIndex);
    assert.ok(flags.includes("--rw") && flags.includes(base), "extra root should be --rw granted");
    assert.deepEqual(out.slice(sepIndex), ["--", "bash", "-c", "echo hi"]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("injectExtraRootGrants: unknown runner shape is left untouched (no silent widening)", () => {
  const base = tempBase();
  try {
    const argv = ["/custom/runner", "x", "y", "--", "bash", "-c", "echo hi"];
    assert.equal(injectExtraRootGrants(argv, [base]), argv);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ── canonicalization + security guard ──────────────────────────────────────

test("canonicalizeExtraRoots: dedups and warns on missing roots", () => {
  const base = tempBase();
  try {
    const existing = join(base, "existing");
    mkdirSync(existing);
    const warnings = [];
    const roots = canonicalizeExtraRoots([existing, existing, join(base, "missing")], { warn: (message) => warnings.push(String(message)) });
    assert.equal(roots.length, 2);
    assert.ok(warnings.length >= 1, "missing root should warn");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("assertSafeWhitelistRoots: rejects roots covering the settings document or the DSH home", () => {
  // homedir() and the fake home are ancestors of the policy store.
  assert.throws(() => assertSafeWhitelistRoots([homedir()], { settingsPath: FAKE_SETTINGS, dshHome: FAKE_HOME }), /DSH home writable/);
  assert.throws(() => assertSafeWhitelistRoots([FAKE_HOME], { settingsPath: FAKE_SETTINGS, dshHome: FAKE_HOME }), /DSH home writable/);
  assert.throws(() => assertSafeWhitelistRoots(["/"], { settingsPath: FAKE_SETTINGS, dshHome: FAKE_HOME }), /refusing/);
  // Unrelated roots pass.
  assert.doesNotThrow(() => assertSafeWhitelistRoots([join(tmpdir(), "unrelated")], { settingsPath: FAKE_SETTINGS, dshHome: FAKE_HOME }));
});

test("WhitelistRoots: applies safe changes, rejects unsafe ones keeping last-good", () => {
  const base = tempBase();
  const safe = join(base, "safe");
  const second = join(base, "second");
  mkdirSync(safe);
  mkdirSync(second);
  const safeCanon = canonicalPath(safe);
  const secondCanon = canonicalPath(second);
  try {
    const source = rootsSource(undefined, [safeCanon]);
    assert.deepEqual(source.roots, [safeCanon]);

    source.apply([secondCanon]);
    assert.deepEqual(source.roots, [secondCanon], "safe hot update should apply");

    assert.throws(() => source.apply([homedir()]), /refusing/);
    assert.deepEqual(source.roots, [secondCanon], "unsafe hot update must keep the previous whitelist");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ── fs side: whitelist writable, others denied ─────────────────────────────

function fsContext(workspaceRoot) {
  const ctx = new Context();
  ctx.provide("sandboxPolicy", {
    defaultMode: "workspace-write",
    resolve: () => ({ mode: "workspace-write", workspaceRoot }),
  });
  return ctx;
}

test("WhitelistFileSystem: whitelist root writable, workspace writable, others denied", async () => {
  // workspace sits under tmpdir (writable by the stock policy's tmp roots);
  // whitelist and outside sit under the home dir, which is OUTSIDE the stock
  // writable set — so the whitelist allowance genuinely exercises the
  // fallback (stock denies, whitelist allows), and the outside denial proves
  // the fence still holds. `resolve` keeps the missing suffix in targetKey,
  // so the targets need not exist for the containment checks.
  const base = tempBase();
  const stamp = `${process.pid}-${Date.now()}`;
  const workspace = join(base, "workspace");
  const whitelist = join(homedir(), `.dsh-wl-whitelist-${stamp}`);
  const outside = join(homedir(), `.dsh-wl-outside-${stamp}`);
  mkdirSync(workspace);
  try {
    const ctx = fsContext(workspace);
    const fs = new WhitelistFileSystem(ctx, SandboxedFileSystem.Config({}), rootsSource(undefined, [whitelist]));
    const policy = { mode: "workspace-write", workspaceRoot: workspace };

    const inWhitelist = await fs.resolve(join(whitelist, "a.txt"));
    assert.ok(await fs.checkedTarget(inWhitelist, policy), "whitelist target should pass (stock denies, whitelist allows)");

    const inWorkspace = await fs.resolve(join(workspace, "b.txt"));
    assert.ok(await fs.checkedTarget(inWorkspace, policy), "stock workspace target should still pass");

    const outsideTarget = await fs.resolve(join(outside, "c.txt"));
    await assert.rejects(
      () => fs.checkedTarget(outsideTarget, policy),
      (error) => error instanceof FsError && error.code === "FS_SANDBOX_DENIED",
      "non-whitelist target should stay denied with the structured code",
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("WhitelistFileSystem: hot-updated whitelist applies on the next call", async () => {
  const base = tempBase();
  const workspace = join(base, "workspace");
  const first = join(homedir(), `.dsh-wl-first-${process.pid}-${Date.now()}`);
  const second = join(homedir(), `.dsh-wl-second-${process.pid}-${Date.now()}`);
  mkdirSync(workspace);
  try {
    const ctx = fsContext(workspace);
    const source = rootsSource(undefined, [first]);
    const fs = new WhitelistFileSystem(ctx, SandboxedFileSystem.Config({}), source);
    const policy = { mode: "workspace-write", workspaceRoot: workspace };

    const targetSecond = await fs.resolve(join(second, "x.txt"));
    await assert.rejects(
      () => fs.checkedTarget(targetSecond, policy),
      (error) => error instanceof FsError && error.code === "FS_SANDBOX_DENIED",
      "not yet whitelisted → denied",
    );

    source.apply([second]);
    assert.ok(await fs.checkedTarget(targetSecond, policy), "whitelisted after hot update → allowed on the next call");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ── bash side: confine() injects the whitelist into the real stock wrap ────

test("WhitelistBashExecutor: confine() injects whitelist into the stock wrap", async () => {
  const base = tempBase();
  const workspace = join(base, "workspace");
  const whitelistRaw = join(base, "whitelist");
  mkdirSync(workspace);
  mkdirSync(whitelistRaw);
  const whitelist = canonicalPath(whitelistRaw);
  try {
    const ctx = fsContext(workspace);
    new LocalSandboxProvider(ctx, LocalSandboxProvider.Config({})); // stock ctx.sandbox
    const executor = new WhitelistBashExecutor(ctx, SandboxBashExecutor.Config({ timeoutMs: 6e4 }), rootsSource(undefined, [whitelist]));
    const confined = executor.confine("echo hi", { mode: "workspace-write", workspaceRoot: workspace });
    assert.equal(confined.argv.at(-1), "echo hi", "inner command intact");
    assert.ok(confined.argv.includes("--"), "argv separator present");
    assert.ok(confined.denialSignatures.length > 0, "stock denial dialect retained");
    if (confined.argv[0] === "sandbox-exec") {
      assert.ok(confined.argv[2].includes(`(allow file-write* (subpath "${whitelist}"))`), "seatbelt profile should allow the whitelist");
    } else if (confined.argv[0] === "bwrap") {
      const flags = confined.argv.slice(0, confined.argv.indexOf("--"));
      assert.ok(flags.some((arg, i) => arg === "--bind" && flags[i + 1] === whitelist), "bwrap should bind the whitelist");
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("WhitelistBashExecutor: empty whitelist keeps stock wrap byte-identical", async () => {
  const base = tempBase();
  const workspace = join(base, "workspace");
  mkdirSync(workspace);
  try {
    const ctx = fsContext(workspace);
    new LocalSandboxProvider(ctx, LocalSandboxProvider.Config({}));
    const executor = new WhitelistBashExecutor(ctx, SandboxBashExecutor.Config({ timeoutMs: 6e4 }), rootsSource(undefined, []));
    const policy = { mode: "workspace-write", workspaceRoot: workspace };
    const confined = executor.confine("echo hi", policy);
    const stockWrap = ctx.sandbox.confine(["bash", "-c", "echo hi"], policy);
    assert.deepEqual(confined.argv, stockWrap.argv, "argv must match the stock wrap exactly");
    assert.deepEqual(confined.denialSignatures, stockWrap.denialSignatures);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
