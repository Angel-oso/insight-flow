import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "edge-runtime",
		// convex-test runs every mutation in-process; the scale and purge tests
		// drive hundreds of them and exceed the 5s default when suites run in
		// parallel on slower machines (CI).
		testTimeout: 30_000,
	},
});
