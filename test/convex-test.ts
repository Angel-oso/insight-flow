import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import resendTest from "@convex-dev/resend/test";
import { convexTest } from "convex-test";
import schema from "../convex/schema";

// Keep in sync with the aggregate instances in convex/convex.config.ts.
const FEEDBACK_AGGREGATES = [
	"feedbackByReceived",
	"feedbackByCompleted",
	"feedbackByStatus",
	"feedbackByCategory",
	"feedbackByAssignee",
	"feedbackByAssigneeCompleted",
] as const;

type Modules = Record<string, () => Promise<unknown>>;

/**
 * convex-test instance with every component from convex/convex.config.ts
 * registered. Always use this instead of calling `convexTest` directly so
 * code paths that touch a component (rate limits, aggregates, email) work.
 * Keep the component names in sync with convex.config.ts.
 */
export function newConvexTest(modules: Modules) {
	const t = convexTest(schema, modules);
	rateLimiterTest.register(t, "rateLimiter");
	resendTest.register(t, "resend");
	for (const name of FEEDBACK_AGGREGATES) aggregateTest.register(t, name);
	return t;
}
