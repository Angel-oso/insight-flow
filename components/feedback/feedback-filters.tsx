"use client";

import {
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Search,
	SlidersHorizontal,
	X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type {
	FeedbackCategory,
	FeedbackPriority,
	FeedbackStatus,
} from "./model";

type DateRange = "Any time" | "Past 7 days" | "Past 30 days";

type FilterMenuProps<T extends string> = {
	readonly label: string;
	readonly value: T;
	readonly options: readonly T[];
	readonly onValueChange: (value: T) => void;
};

function FilterMenu<T extends string>({
	label,
	value,
	options,
	onValueChange,
}: FilterMenuProps<T>) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="outline" size="sm" aria-label={`Filter by ${label}`}>
						<span className="text-muted-foreground">{label}</span>
						<span className="max-w-24 truncate">{value}</span>
						<ChevronDown data-icon="inline-end" />
					</Button>
				}
			/>
			<DropdownMenuContent className="w-48">
				<DropdownMenuGroup>
					<DropdownMenuLabel>{label}</DropdownMenuLabel>
					{options.map((option) => (
						<DropdownMenuItem
							key={option}
							onClick={() => onValueChange(option)}
						>
							<span>{option}</span>
							{option === value ? <Check className="ml-auto size-3.5" /> : null}
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export type FeedbackFiltersState = {
	readonly query: string;
	readonly status: "All statuses" | FeedbackStatus;
	readonly priority: "All priorities" | FeedbackPriority;
	readonly category: "All categories" | FeedbackCategory;
	readonly dateRange: DateRange;
	readonly attentionOnly: boolean;
};

export function FeedbackFilters({
	filters,
	onFiltersChange,
	onReset,
	page,
	pageCount,
	pageSize,
	totalItems,
	onPageChange,
}: {
	readonly filters: FeedbackFiltersState;
	readonly onFiltersChange: (filters: FeedbackFiltersState) => void;
	readonly onReset: () => void;
	readonly page: number;
	readonly pageCount: number;
	readonly pageSize: number;
	readonly totalItems: number;
	readonly onPageChange: (page: number) => void;
}) {
	const hasActiveFilters =
		filters.query.length > 0 ||
		filters.status !== "All statuses" ||
		filters.priority !== "All priorities" ||
		filters.category !== "All categories" ||
		filters.dateRange !== "Any time" ||
		filters.attentionOnly;

	return (
		<div className="border-b p-5">
			<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
				<div className="relative w-full min-w-0 xl:max-w-sm">
					<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						aria-label="Search feedback"
						className="pl-8"
						value={filters.query}
						onChange={(event) =>
							onFiltersChange({ ...filters, query: event.target.value })
						}
						placeholder="Search title or sender"
					/>
				</div>
				<div className="flex flex-wrap items-center gap-1.5">
					<SlidersHorizontal className="ml-1 size-3.5 text-muted-foreground" />
					<FilterMenu
						label="Status"
						value={filters.status}
						options={[
							"All statuses",
							"New",
							"In review",
							"Planned",
							"In progress",
							"Completed",
							"Discarded",
						]}
						onValueChange={(status) => onFiltersChange({ ...filters, status })}
					/>
					<FilterMenu
						label="Priority"
						value={filters.priority}
						options={["All priorities", "Low", "Medium", "High", "Critical"]}
						onValueChange={(priority) =>
							onFiltersChange({ ...filters, priority })
						}
					/>
					<FilterMenu
						label="Category"
						value={filters.category}
						options={[
							"All categories",
							"Bug",
							"Feature request",
							"Improvement",
							"Question",
							"Other",
						]}
						onValueChange={(category) =>
							onFiltersChange({ ...filters, category })
						}
					/>
					<FilterMenu
						label="Received"
						value={filters.dateRange}
						options={["Any time", "Past 7 days", "Past 30 days"]}
						onValueChange={(dateRange) =>
							onFiltersChange({ ...filters, dateRange })
						}
					/>
					<Button
						variant={filters.attentionOnly ? "secondary" : "ghost"}
						size="sm"
						onClick={() =>
							onFiltersChange({
								...filters,
								attentionOnly: !filters.attentionOnly,
							})
						}
						aria-pressed={filters.attentionOnly}
					>
						Needs attention
					</Button>
					{hasActiveFilters ? (
						<Button variant="ghost" size="sm" onClick={onReset}>
							<X data-icon="inline-start" />
							Clear
						</Button>
					) : null}
					{pageCount > 1 ? (
						<div className="flex items-center gap-1 xl:border-l xl:border-border xl:pl-2">
							<span className="mr-1 text-xs text-muted-foreground">
								{(page - 1) * pageSize + 1}–
								{Math.min(page * pageSize, totalItems)} of {totalItems}
							</span>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								disabled={page === 1}
								onClick={() => onPageChange(page - 1)}
								aria-label="Previous page"
								title="Previous page"
							>
								<ChevronLeft />
							</Button>
							<span className="min-w-14 text-center text-xs text-muted-foreground">
								{page}/{pageCount}
							</span>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								disabled={page === pageCount}
								onClick={() => onPageChange(page + 1)}
								aria-label="Next page"
								title="Next page"
							>
								<ChevronRight />
							</Button>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}
