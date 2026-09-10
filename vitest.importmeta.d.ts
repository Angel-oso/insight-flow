/**
 * Minimal import.meta.glob typing for convex-test module maps.
 *
 * Prefer this over `/// <reference types="vite/client" />`: with pnpm's
 * strict node_modules layout the vite/client reference is unresolvable
 * from the root tsconfig (TS2688), while this ambient declaration
 * typechecks everywhere and is exactly what the tests need.
 */
interface ImportMeta {
	readonly glob: (pattern: string) => Record<string, () => Promise<any>>;
}
