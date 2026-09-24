/**
 * Shared contract between the Host half (`src/host`) and the browser half
 * (`src/client`) of dsh-capability-toggle-plugin. Type-only module: it carries
 * no runtime code, so the browser purity gate erases it and the two halves
 * agree on one wire shape without a shared runtime instance.
 *
 * @module dsh-capability-toggle-plugin/shared/types
 */
export {};
