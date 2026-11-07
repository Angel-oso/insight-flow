import aggregate from "@convex-dev/aggregate/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
// Abuse protection for public intake and other user-triggered writes.
app.use(rateLimiter);
// Feedback metrics without reading every row (see convex/feedback/aggregates.ts).
// Every feedback write keeps them in sync through convex/feedback/store.ts.
app.use(aggregate, { name: "feedbackByReceived" });
app.use(aggregate, { name: "feedbackByCompleted" });
app.use(aggregate, { name: "feedbackByStatus" });
app.use(aggregate, { name: "feedbackByCategory" });
app.use(aggregate, { name: "feedbackByAssignee" });
app.use(aggregate, { name: "feedbackByAssigneeCompleted" });

export default app;
