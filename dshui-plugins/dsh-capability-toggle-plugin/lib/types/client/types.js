/**
 * Minimal local type surface for the browser half. The client-side slot and
 * locale services live in platform modules the harness provides at runtime
 * (`@deepseek-ai/dsh-client-ui-slots`, `-primitives`) that are NOT resolvable
 * npm packages in a standalone build, so their prop and service types cannot be
 * imported. This module declares exactly the shapes this plugin reads — nothing
 * more — matching the runtime contract verified against the harness source. The
 * emitted JavaScript is identical to using the framework types; only the
 * compile-time surface is local.
 *
 * @module dsh-capability-toggle-plugin/client/types
 */
export {};
