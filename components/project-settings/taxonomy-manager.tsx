"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useMemo, useRef, useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { useTaxonomies, type Taxonomies } from "@/lib/taxonomy";

type TaxonomyKey = "status" | "category" | "priority";

type DraftRow = {
	readonly key: string;
	readonly value: string | null;
	readonly label: string;
	readonly color: string;
	readonly rank: number;
	readonly isFinal: boolean;
};

type Drafts = Record<TaxonomyKey, readonly DraftRow[]>;

const GROUPS: readonly {
	readonly key: TaxonomyKey;
	readonly title: string;
	readonly singular: string;
	readonly hint: string;
}[] = [
	{
		key: "status",
		title: "Statuses",
		singular: "status",
		hint: "Final states close the backlog instead of counting as open.",
	},
	{
		key: "category",
		title: "Categories",
		singular: "category",
		hint: "What teams are being asked for.",
	},
	{
		key: "priority",
		title: "Priorities",
		singular: "priority",
		hint: "Rank decides severity: the top rank is the critical lane.",
	},
];

function toDrafts(taxonomies: Taxonomies): Drafts {
	const rows = (items: readonly { value: string; label: string; color?: string; rank: number; isFinal?: boolean }[]) =>
		[...items]
			.sort((a, b) => a.rank - b.rank)
			.map((item) => ({
				key: item.value,
				value: item.value,
				label: item.label,
				color: item.color ?? "#6b7280",
				rank: item.rank,
				isFinal: item.isFinal ?? false,
			}));
	return {
		status: rows(taxonomies.statuses),
		category: rows(taxonomies.categories),
		priority: rows(taxonomies.priorities),
	};
}

function useTaxonomyWrites() {
	const createOption = useMutation(api.taxonomies.createOption);
	const updateOption = useMutation(api.taxonomies.updateOption);
	const removeOption = useMutation(api.taxonomies.removeOption);
	const [pendingKey, setPendingKey] = useState<TaxonomyKey | null>(null);
	const [error, setError] = useState<string | null>(null);
	const inFlight = useRef(false);

	async function run(operation: () => Promise<unknown>, key: TaxonomyKey) {
		if (inFlight.current) return false;
		inFlight.current = true;
		setPendingKey(key);
		setError(null);
		try {
			await operation();
			return true;
		} catch (cause) {
			setError(
				cause instanceof ConvexError && typeof cause.data === "string"
					? cause.data
					: "Could not save the values. Please try again.",
			);
			return false;
		} finally {
			inFlight.current = false;
			setPendingKey(null);
		}
	}

	return { pendingKey, error, run, createOption, updateOption, removeOption };
}

export function TaxonomyManager({ disabled }: { readonly disabled: boolean }) {
	const taxonomies = useTaxonomies();
	const { pendingKey, error, run, createOption, updateOption, removeOption } =
		useTaxonomyWrites();
	const [drafts, setDrafts] = useState<Drafts | null>(null);
	const [savedKey, setSavedKey] = useState<TaxonomyKey | null>(null);
	const [confirmKey, setConfirmKey] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const newRowId = useRef(0);
	const derived = useMemo(
		() => (taxonomies ? toDrafts(taxonomies) : null),
		[taxonomies],
	);

	if (!taxonomies || !derived) {
		return (
			<Card className="gap-0 py-0 shadow-none">
				<CardHeader className="border-b px-5 py-5 sm:px-6">
					<CardTitle>Workflow values</CardTitle>
				</CardHeader>
				<p role="status" className="p-5 text-sm text-muted-foreground">
					Loading values…
				</p>
			</Card>
		);
	}

	const rows: Drafts = drafts ?? derived;

	const editRow = (key: TaxonomyKey, rowKey: string, patch: Partial<DraftRow>) => {
		setSavedKey(null);
		setDrafts({
			...rows,
			[key]: rows[key].map((row) =>
				row.key === rowKey ? { ...row, ...patch } : row,
			),
		});
	};

	const addRow = (key: TaxonomyKey) => {
		setSavedKey(null);
		const maxRank = Math.max(0, ...rows[key].map((row) => row.rank));
		newRowId.current += 1;
		setDrafts({
			...rows,
			[key]: [
				...rows[key],
				{
					key: `new-${newRowId.current}`,
					value: null,
					label: "",
					color: "#6b7280",
					rank: maxRank + 1,
					isFinal: false,
				},
			],
		});
	};

	const saveGroup = (key: TaxonomyKey) => {
		void run(async () => {
			const original = new Map(
				toDrafts(taxonomies)[key].map((row) => [row.value, row]),
			);
			// Reconcile locally: drafts already hold the final state, so only
			// fill in server-generated keys instead of rebuilding from the
			// refetch (no list flash, no focus loss).
			const nextRows = [...rows[key]];
			for (let index = 0; index < nextRows.length; index += 1) {
				const row = nextRows[index];
				if (row.value === null) {
					if (row.label.trim().length === 0) continue;
					const created = await createOption({
						key,
						label: row.label,
						color: row.color,
						rank: row.rank,
						...(key === "status" ? { isFinal: row.isFinal } : {}),
					});
					nextRows[index] = { ...row, key: created.value, value: created.value };
					continue;
				}
				const before = original.get(row.value);
				if (!before) continue;
				const patch: {
					label?: string;
					color?: string;
					rank?: number;
					isFinal?: boolean;
				} = {};
				if (row.label !== before.label) patch.label = row.label;
				if (row.color !== before.color) patch.color = row.color;
				if (row.rank !== before.rank) patch.rank = row.rank;
				if (key === "status" && row.isFinal !== before.isFinal)
					patch.isFinal = row.isFinal;
				if (Object.keys(patch).length > 0) {
					await updateOption({ key, value: row.value, ...patch });
				}
			}
			setDrafts({ ...rows, [key]: nextRows });
			setSavedKey(key);
			setConfirmKey(null);
		}, key);
	};

	const removeRow = (key: TaxonomyKey, row: DraftRow) => {
		if (row.value === null) {
			setDrafts({
				...rows,
				[key]: rows[key].filter((candidate) => candidate.key !== row.key),
			});
			return;
		}
		if (confirmKey !== row.key) {
			setConfirmKey(row.key);
			return;
		}
		void run(async () => {
			await removeOption({ key, value: row.value as string });
			// Drop the row locally; the server refetch arrives silently.
			setDrafts({
				...rows,
				[key]: rows[key].filter((candidate) => candidate.key !== row.key),
			});
			setSavedKey(key);
			setConfirmKey(null);
		}, key);
	};

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<Card className="gap-0 py-0 shadow-none">
				<CardHeader className={`px-0 ${open ? "border-b" : ""}`}>
					<CollapsibleTrigger
						render={
							<button
								type="button"
								aria-label={open ? "Collapse workflow values" : "Expand workflow values"}
								className="flex w-full cursor-pointer items-start justify-between gap-3 px-5 py-5 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:bg-muted/40 sm:px-6"
							>
								<span>
									<span className="block font-heading text-base leading-snug font-medium">
										Workflow values
									</span>
									<span className="mt-1 block text-sm text-muted-foreground">
										Shared across all projects. Names, colors, and ranks apply
										everywhere instantly; option keys never change once created.
									</span>
								</span>
								<ChevronDown
									className={`mt-1 size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
								/>
							</button>
						}
					/>
				</CardHeader>
				<CollapsibleContent>
					<CardContent className="space-y-8 px-5 py-5 sm:px-6">
				{error ? (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				) : null}
				{GROUPS.map((group) => (
					<section key={group.key} aria-label={group.title}>
						<div className="flex items-baseline justify-between gap-3">
							<div>
								<h3 className="text-sm font-semibold">{group.title}</h3>
								<p className="mt-0.5 text-xs text-muted-foreground">
									{group.hint}
								</p>
							</div>
							<span className="text-xs text-muted-foreground tabular-nums">
								{rows[group.key].length} options
							</span>
						</div>
						<ul className="mt-3 space-y-2">
							{rows[group.key].map((row) => (
								<li
									key={row.key}
									className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2"
								>
									<input
										type="color"
										aria-label={`Color for ${row.label || "new option"}`}
										title="Pick a color"
										value={row.color}
										disabled={disabled || pendingKey === group.key}
										onChange={(event) =>
											editRow(group.key, row.key, { color: event.target.value })
										}
										className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-card p-1 disabled:cursor-not-allowed disabled:opacity-50"
									/>
									<Input
										aria-label={`Name for ${group.singular}`}
										placeholder={`New ${group.singular} name`}
										value={row.label}
										maxLength={40}
										disabled={disabled || pendingKey === group.key}
										onChange={(event) =>
											editRow(group.key, row.key, { label: event.target.value })
										}
										className="min-w-36 flex-1"
									/>
									<label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
										Rank
										<Input
											aria-label={`Rank for ${row.label || "new option"}`}
											type="number"
											min={0}
											max={99}
											value={row.rank}
											disabled={disabled || pendingKey === group.key}
											onChange={(event) =>
												editRow(group.key, row.key, {
													rank: Number(event.target.value),
												})
											}
											className="w-16 tabular-nums"
										/>
									</label>
									{group.key === "status" ? (
										<label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
											<input
												type="checkbox"
												checked={row.isFinal}
												disabled={disabled || pendingKey === group.key}
												onChange={(event) =>
													editRow(group.key, row.key, {
														isFinal: event.target.checked,
													})
												}
												className="size-4 accent-primary"
											/>
											Final
										</label>
									) : null}
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label={
											confirmKey === row.key
												? `Confirm remove ${row.label || "option"}`
												: `Remove ${row.label || "option"}`
										}
										title={
											confirmKey === row.key ? "Click again to confirm" : "Remove"
										}
										onBlur={() => setConfirmKey(null)}
										onClick={() => removeRow(group.key, row)}
										disabled={disabled || pendingKey === group.key}
										className={
											confirmKey === row.key
												? "shrink-0 text-destructive hover:text-destructive"
												: "shrink-0 text-muted-foreground"
										}
									>
										<Trash2 />
										{confirmKey === row.key ? (
											<span className="sr-only">Confirm</span>
										) : null}
									</Button>
									{confirmKey === row.key ? (
										<span role="alert" className="text-xs font-medium text-destructive">
											Sure?
										</span>
									) : null}
								</li>
							))}
						</ul>
						<div className="mt-3 flex flex-wrap items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => addRow(group.key)}
								disabled={disabled || pendingKey === group.key}
							>
								Add {group.singular}
							</Button>
							<Button
								type="button"
								size="sm"
								onClick={() => saveGroup(group.key)}
								disabled={disabled || pendingKey === group.key}
							>
								{pendingKey === group.key ? "Saving…" : `Save ${group.title.toLowerCase()}`}
							</Button>
						{savedKey === group.key ? (
							<span role="status" className="text-xs text-muted-foreground">
								Saved · Live everywhere.
							</span>
						) : null}
					</div>
				</section>
			))}
			</CardContent>
			</CollapsibleContent>
		</Card>
		</Collapsible>
	);
}
