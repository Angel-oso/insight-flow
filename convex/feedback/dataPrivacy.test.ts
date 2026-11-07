/**
 * Feedback data hardening: taxonomy caps, completedAt on arrival, paginated
 * discussions, submitter email visibility, exports and submitter erasure.
 */
import { newConvexTest } from "../../test/convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { TAXONOMY_OPTION_LIMITS } from "../taxonomies/limits";
import { feedbackByCompleted, feedbackByReceived, feedbackByStatus } from "./aggregates";
import { csvCell } from "./export";
import { insertFeedbackRow } from "./store";

const modules = {
	...Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([path, load]) => [path.replace(/^\.\.\//, "./"), load])),
	...Object.fromEntries(Object.entries(import.meta.glob("./**/*.ts")).map(([path, load]) => [path.replace(/^\.\//, "./feedback/"), load])),
};

type Fields = Omit<Doc<"feedback">, "_id" | "_creationTime">;

afterEach(() => {
	vi.useRealTimers();
});

async function fixture() {
	const t = newConvexTest(modules);
	const ownerId = await t.run((ctx) => ctx.db.insert("users", { name: "Owner", email: "owner@example.com" }));
	const owner = t.withIdentity({ subject: ownerId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, { name: "Acme", projectName: "Portal" });
	const project = (await t.run((ctx) =>
		ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique(),
	))!;
	const projectId = project._id;
	const join = async (name: string, role: "manager" | "member") => {
		const userId = await t.run((ctx) => ctx.db.insert("users", { name, email: `${name.toLowerCase()}@example.com` }));
		await t.mutation(internal.setup.admin.assignUserAccess, {
			userId, organizationId: project.organizationId, roleNames: [role], projectIds: [projectId],
		});
		return t.withIdentity({ subject: userId });
	};
	const manager = await join("Manny", "manager");
	const member = await join("Mel", "member");
	const row = (overrides: Partial<Fields> = {}): Fields => ({
		projectId,
		title: "Item",
		description: "Seeded",
		category: "Bug",
		priority: "Low",
		status: "New",
		assigneeId: null,
		sender: null,
		receivedAt: Date.now(),
		updatedAt: Date.now(),
		...overrides,
	});
	return { t, owner, manager, member, ownerId, projectSlug, projectId, organizationId: project.organizationId, row };
}

test("taxonomy options are capped per key", async () => {
	const { owner, projectSlug } = await fixture();
	const { statuses, priorities } = await owner.query(api.taxonomies.queries.list, { projectSlug });
	for (let index = statuses.length; index < TAXONOMY_OPTION_LIMITS.status; index++)
		await owner.mutation(api.taxonomies.mutations.createOption, {
			projectSlug, key: "status", label: `Stage ${index}`, color: "#111111",
		});
	await expect(owner.mutation(api.taxonomies.mutations.createOption, {
		projectSlug, key: "status", label: "One too many", color: "#111111",
	})).rejects.toThrow(/at most 10 statuses/);
	for (let index = priorities.length; index < TAXONOMY_OPTION_LIMITS.priority; index++)
		await owner.mutation(api.taxonomies.mutations.createOption, {
			projectSlug, key: "priority", label: `Level ${index}`, color: "#111111",
		});
	await expect(owner.mutation(api.taxonomies.mutations.createOption, {
		projectSlug, key: "priority", label: "One too many", color: "#111111",
	})).rejects.toThrow(/at most 6 priorities/);
	const after = await owner.query(api.taxonomies.queries.list, { projectSlug });
	expect(after.statuses).toHaveLength(TAXONOMY_OPTION_LIMITS.status);
	expect(after.priorities).toHaveLength(TAXONOMY_OPTION_LIMITS.priority);
});

test("feedback arriving in a final entry status is completed on insert", async () => {
	const { t, owner, projectSlug, projectId } = await fixture();
	await owner.mutation(api.taxonomies.mutations.updateOption, {
		projectSlug, key: "status", value: "New", isFinal: true,
	});
	const { feedbackId } = await owner.mutation(api.feedback.mutations.create, {
		projectSlug, title: "Logged fact", description: "Nothing to triage here.", category: "Bug", priority: "Medium",
	});
	const item = await t.run((ctx) => ctx.db.get("feedback", feedbackId));
	expect(item?.status).toBe("New");
	expect(item?.completedAt).toBe(item?.receivedAt);
	const completed = await t.run((ctx) =>
		feedbackByCompleted.count(ctx, { namespace: projectId, bounds: { lower: { key: 0, inclusive: true } } }),
	);
	expect(completed).toBe(1);
});

test("completedAt sync walks every page of an organization's projects", async () => {
	vi.useFakeTimers();
	const { t, owner, projectSlug, projectId, row } = await fixture();
	// 130 extra projects (more than one 100-project page), each with an item.
	const lastProject = await t.run(async (ctx) => {
		const base = (await ctx.db.get("projects", projectId))!;
		const { _id, _creationTime, ...fields } = base;
		void _id; void _creationTime;
		let last: Id<"projects"> = projectId;
		for (let index = 0; index < 130; index++) {
			last = await ctx.db.insert("projects", { ...fields, slug: `extra-${index}` });
			await insertFeedbackRow(ctx, row({ projectId: last, status: "In review" }));
		}
		return last;
	});
	await owner.mutation(api.taxonomies.mutations.updateOption, {
		projectSlug, key: "status", value: "In review", isFinal: true,
	});
	await t.finishAllScheduledFunctions(vi.runAllTimers, 1000);
	const items = await t.run((ctx) =>
		ctx.db.query("feedback").withIndex("by_projectId_status", (q) => q.eq("projectId", lastProject)).collect(),
	);
	expect(items).toHaveLength(1);
	expect(items[0].completedAt).toBeTypeOf("number");
});

test("comments and activity page through long discussions", async () => {
	const { t, owner, member, ownerId, projectSlug, projectId, row } = await fixture();
	const feedbackId = await t.run(async (ctx) => {
		const id = await insertFeedbackRow(ctx, row());
		for (let index = 0; index < 130; index++) {
			await ctx.db.insert("comments", { feedbackId: id, authorId: ownerId, body: `Note ${index}`, createdAt: 1000 + index });
			await ctx.db.insert("activities", {
				projectId, feedbackId: id, actorId: ownerId, type: "updated", message: `Change ${index}`, createdAt: 1000 + index,
			});
		}
		return id;
	});
	const detail = (await owner.query(api.feedback.queries.detail, { projectSlug, feedbackId }))!;
	expect(detail.comments).toHaveLength(20);
	expect(detail.comments[0].body).toBe("Note 129");

	const bodies: string[] = [];
	let cursor: string | null = null;
	for (;;) {
		const page: { page: { body: string; author: string }[]; isDone: boolean; continueCursor: string } =
			await member.query(api.feedback.queries.comments, {
				projectSlug, feedbackId, paginationOpts: { numItems: 50, cursor },
			});
		bodies.push(...page.page.map((comment) => comment.body));
		expect(page.page.every((comment) => comment.author === "Owner")).toBe(true);
		if (page.isDone) break;
		cursor = page.continueCursor;
	}
	expect(bodies).toHaveLength(130);
	expect(bodies[0]).toBe("Note 129");
	expect(bodies.at(-1)).toBe("Note 0");

	// One page never exceeds the server cap.
	const big = await owner.query(api.feedback.queries.activities, {
		projectSlug, feedbackId, paginationOpts: { numItems: 1000, cursor: null },
	});
	expect(big.page).toHaveLength(100);
	expect(big.isDone).toBe(false);
	const rest = await owner.query(api.feedback.queries.activities, {
		projectSlug, feedbackId, paginationOpts: { numItems: 100, cursor: big.continueCursor },
	});
	expect(rest.page).toHaveLength(30);
	expect(rest.page.at(-1)?.message).toBe("Change 0");

	// Outsiders cannot read the discussion.
	const stranger = t.withIdentity({ subject: await t.run((ctx) => ctx.db.insert("users", { name: "Stranger" })) });
	await expect(stranger.query(api.feedback.queries.comments, {
		projectSlug, feedbackId, paginationOpts: { numItems: 10, cursor: null },
	})).rejects.toThrow();
});

test("submitter emails reach triagers only", async () => {
	const { t, owner, manager, member, projectSlug, row } = await fixture();
	const feedbackId = await t.run((ctx) =>
		insertFeedbackRow(ctx, row({ sender: { name: "Sam Sender", email: "sam@customer.example" } })),
	);
	const sender = (viewer: typeof owner) => Promise.all([
		viewer.query(api.feedback.queries.list, { projectSlug, filters: {}, paginationOpts: { numItems: 10, cursor: null } })
			.then((page) => page.page[0].sender),
		viewer.query(api.feedback.queries.find, { projectSlug, feedbackId }).then((item) => item?.sender),
		viewer.query(api.feedback.queries.detail, { projectSlug, feedbackId }).then((data) => data?.item.sender),
	]);
	const visible = { name: "Sam Sender", email: "sam@customer.example" };
	expect(await sender(owner)).toEqual([visible, visible, visible]);
	expect(await sender(manager)).toEqual([visible, visible, visible]);
	const hidden = { name: "Sam Sender", email: null };
	expect(await sender(member)).toEqual([hidden, hidden, hidden]);
});

test("CSV cells neutralize spreadsheet formulas and quote content", () => {
	expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
	expect(csvCell("+1")).toBe("\"'+1\"");
	expect(csvCell("-2")).toBe("\"'-2\"");
	expect(csvCell("@SUM(A1)")).toBe("\"'@SUM(A1)\"");
	expect(csvCell("\tcmd")).toBe("\"'\tcmd\"");
	expect(csvCell("plain, text")).toBe("\"plain, text\"");
	expect(csvCell(null)).toBe("\"\"");
});

test("exports need project.manage and an own, live, audited grant", async () => {
	const { t, owner, manager, member, projectSlug, organizationId, row } = await fixture();
	await t.run(async (ctx) => {
		await insertFeedbackRow(ctx, row({ title: "=cmd|' /C calc'!A0", sender: { name: "Ann", email: "ann@x.example" } }));
		for (let index = 0; index < 4; index++) await insertFeedbackRow(ctx, row({ title: `Item ${index}`, receivedAt: 10 + index }));
	});
	for (const viewer of [manager, member])
		await expect(viewer.mutation(api.feedback.export.start, { projectSlug, format: "csv" }))
			.rejects.toThrow("You cannot make this change.");

	const csv = await owner.mutation(api.feedback.export.start, { projectSlug, format: "csv" });
	expect(csv.total).toBe(5);
	expect(csv.header).toBe("\"id\",\"title\",\"description\",\"category\",\"priority\",\"status\",\"assignee\",\"senderName\",\"senderEmail\",\"receivedAt\",\"updatedAt\",\"completedAt\"");
	const lines: string[] = [];
	let cursor: string | null = null;
	for (;;) {
		const page: { page: string[]; isDone: boolean; continueCursor: string } = await owner.query(api.feedback.export.page, {
			projectSlug, exportId: csv.exportId, paginationOpts: { numItems: 2, cursor },
		});
		lines.push(...page.page);
		if (page.isDone) break;
		cursor = page.continueCursor;
	}
	expect(lines).toHaveLength(5);
	const injected = lines.find((line) => line.includes("calc"))!;
	expect(injected).toContain("\"'=cmd|' /C calc'!A0\"");
	expect(injected).toContain("\"ann@x.example\"");

	// Someone else's grant (even an admin page reader) is refused.
	await expect(manager.query(api.feedback.export.page, {
		projectSlug, exportId: csv.exportId, paginationOpts: { numItems: 2, cursor: null },
	})).rejects.toThrow("You cannot make this change.");

	const json = await owner.mutation(api.feedback.export.start, { projectSlug, format: "json" });
	expect(json.header).toBeNull();
	const jsonPage = await owner.query(api.feedback.export.page, {
		projectSlug, exportId: json.exportId, paginationOpts: { numItems: 10, cursor: null },
	});
	const parsed = jsonPage.page.map((line) => JSON.parse(line));
	expect(parsed.find((item) => item.senderEmail === "ann@x.example")?.title).toBe("=cmd|' /C calc'!A0");

	// Expired grants stop working.
	await t.mutation(internal.feedback.export.expire, { exportId: json.exportId });
	await expect(owner.query(api.feedback.export.page, {
		projectSlug, exportId: json.exportId, paginationOpts: { numItems: 10, cursor: null },
	})).rejects.toThrow(/expired/);

	const audit = await t.run((ctx) =>
		ctx.db.query("auditLogs").withIndex("by_organizationId_at", (q) => q.eq("organizationId", organizationId)).collect(),
	);
	expect(audit.filter((entry) => entry.action === "project.feedback_exported")).toHaveLength(2);

	// Rate limited: a burst of 5 per user.
	for (let index = 0; index < 3; index++)
		await owner.mutation(api.feedback.export.start, { projectSlug, format: "csv" });
	await expect(owner.mutation(api.feedback.export.start, { projectSlug, format: "csv" }))
		.rejects.toThrow(/exported feedback several times/);
});

test("erasing a submitter clears matching senders across pages and leaves metrics alone", async () => {
	vi.useFakeTimers();
	const { t, owner, manager, projectSlug, projectId, organizationId, row } = await fixture();
	await t.run(async (ctx) => {
		for (let index = 0; index < 260; index++)
			await insertFeedbackRow(ctx, row({
				receivedAt: 1000 + index,
				status: index % 3 === 0 ? "Completed" : "New",
				sender: index % 2 === 0
					? { name: "Erin Erased", email: "erin@customer.example" }
					: { name: "Kim Kept", email: "kim@customer.example" },
			}));
	});
	const metrics = () => t.run(async (ctx) => ({
		total: await feedbackByReceived.count(ctx, { namespace: projectId }),
		completed: await feedbackByStatus.count(ctx, { namespace: projectId, bounds: { prefix: ["Completed"] } }),
	}));
	const before = await metrics();

	await expect(manager.mutation(api.feedback.privacy.redactSender, { projectSlug, email: "erin@customer.example" }))
		.rejects.toThrow("You cannot make this change.");
	await expect(owner.mutation(api.feedback.privacy.redactSender, { projectSlug, email: "not-an-email" }))
		.rejects.toThrow(/valid email/);

	const result = await owner.mutation(api.feedback.privacy.redactSender, { projectSlug, email: "  Erin@Customer.example " });
	expect(result.done).toBe(false);
	expect(result.redacted).toBe(100);
	await t.finishAllScheduledFunctions(vi.runAllTimers);

	const items = await t.run((ctx) =>
		ctx.db.query("feedback").withIndex("by_projectId_receivedAt", (q) => q.eq("projectId", projectId)).collect(),
	);
	expect(items.filter((item) => item.sender === null)).toHaveLength(130);
	expect(items.filter((item) => item.sender?.email === "kim@customer.example")).toHaveLength(130);
	expect(items.some((item) => item.sender?.email === "erin@customer.example")).toBe(false);
	expect(await metrics()).toEqual(before);

	const audit = await t.run((ctx) =>
		ctx.db.query("auditLogs").withIndex("by_organizationId_at", (q) => q.eq("organizationId", organizationId)).collect(),
	);
	const entry = audit.find((log) => log.action === "project.sender_redacted");
	expect(entry).toBeDefined();
	expect(entry!.summary).not.toContain("erin");
});

test("submitter erasure finishes even if the project is marked for deletion meanwhile", async () => {
	vi.useFakeTimers();
	const { t, owner, projectSlug, projectId, row } = await fixture();
	await t.run(async (ctx) => {
		for (let index = 0; index < 450; index++)
			await insertFeedbackRow(ctx, row({ receivedAt: 1000 + index, sender: { name: "Erin", email: "erin@customer.example" } }));
	});
	const result = await owner.mutation(api.feedback.privacy.redactSender, { projectSlug, email: "erin@customer.example" });
	expect(result.done).toBe(false);
	// Deletion requested before the continuation runs; a restore could follow.
	await t.run((ctx) => ctx.db.patch("projects", projectId, { deletionRequestedAt: Date.now() }));
	await t.finishAllScheduledFunctions(vi.runAllTimers);
	const left = await t.run(async (ctx) =>
		(await ctx.db.query("feedback").withIndex("by_projectId_receivedAt", (q) => q.eq("projectId", projectId)).collect())
			.filter((item) => item.sender !== null),
	);
	expect(left).toEqual([]);
});
