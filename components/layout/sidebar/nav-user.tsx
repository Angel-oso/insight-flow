"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useConvex, useQuery } from "convex/react";
import { BadgeCheck, ChevronsUpDown, Download, Loader2, LogOut, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ConfirmDialog, errorMessage } from "@/components/common/confirm-dialog";
import { AccountEmailChange } from "@/components/layout/sidebar/account-email-change";
import { ThemeMenuItem } from "@/components/layout/sidebar/theme-menu-item";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { api } from "@/convex/_generated/api";
import { downloadFile } from "@/lib/download";

/** Pages of up to 100 items; the cap keeps a runaway loop bounded. */
const EXPORT_PAGE_SIZE = 100;
const EXPORT_MAX_PAGES = 500;

type ExportPage<T> = { page: T[]; isDone: boolean; continueCursor: string };

async function collectPages<T>(
	fetchPage: (cursor: string | null) => Promise<ExportPage<T>>,
	onProgress: (count: number) => void,
) {
	const items: T[] = [];
	let cursor: string | null = null;
	for (let index = 0; index < EXPORT_MAX_PAGES; index++) {
		const result: ExportPage<T> = await fetchPage(cursor);
		items.push(...result.page);
		onProgress(items.length);
		if (result.isDone) break;
		cursor = result.continueCursor;
	}
	return items;
}

/** Progress of "Download my data", shown in its own dialog (the menu closes). */
type ExportStatus =
	| { readonly state: "running"; readonly step: string }
	| { readonly state: "done"; readonly fileName: string }
	| { readonly state: "error"; readonly message: string };

function initials(name: string) {
	return name
		.split(/\s+/)
		.map((part) => part[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

export function NavUser() {
	const { isMobile } = useSidebar();
	const profile = useQuery(api.users.queries.current, {});
	const updateAccount = useAction(api.users.account.update);
	const { signOut } = useAuthActions();
	const convex = useConvex();
	const deleteAccount = useAction(api.users.deletion.deleteAccount);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [deletePassword, setDeletePassword] = useState("");
	const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
	const isExporting = exportStatus?.state === "running";
	const [isAccountOpen, setIsAccountOpen] = useState(false);
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [isSavingAccount, setIsSavingAccount] = useState(false);
	const [accountName, setAccountName] = useState("");
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [accountError, setAccountError] = useState<string | null>(null);
	const [accountNotice, setAccountNotice] = useState<string | null>(null);
	// undefined while loading; null only when the session has no profile.
	const name = profile === undefined ? "Loading account…" : (profile?.name ?? "Your account");
	const email = profile === undefined ? "" : (profile?.email ?? "No email address");
	const userInitials = profile ? initials(name) : "";

	async function handleSignOut() {
		setIsSigningOut(true);
		try {
			await signOut();
		} finally {
			setIsSigningOut(false);
		}
	}

	// Accounts without an email confirm with the word DELETE (the server
	// applies the same rule).
	const deleteConfirmation = profile?.email ?? "DELETE";

	async function confirmDeleteAccount(typed: string) {
		// Send what the user typed; the server checks it against the account
		// and re-authenticates (password, or a recent sign-in without one).
		await deleteAccount({
			confirmation: typed,
			...(profile?.hasPassword ? { currentPassword: deletePassword } : {}),
		});
		setDeletePassword("");
		setIsAccountOpen(false);
		// The account is gone from here on, so a sign-out hiccup must never
		// surface as a deletion error. The server already removed every
		// session; signOut only clears the local tokens.
		try {
			await signOut();
		} catch {
			// Stale tokens are rejected on their next refresh anyway.
		}
		// A full navigation drops the app shell and its subscriptions instead
		// of letting workspace queries re-run without an account, and wins
		// over the auth guard's /login redirect.
		window.location.replace("/");
	}

	/** GDPR self-export: every section, page by page, saved as one JSON file. */
	async function downloadMyData() {
		if (isExporting) return;
		const step = (label: string) => (count: number) =>
			setExportStatus({ state: "running", step: `${label} (${count} so far)…` });
		setExportStatus({ state: "running", step: "Reading your profile…" });
		try {
			const page = (cursor: string | null) => ({
				paginationOpts: { numItems: EXPORT_PAGE_SIZE, cursor },
			});
			const account = await convex.query(api.users.export.profile, {});
			const comments = await collectPages(
				(cursor) => convex.query(api.users.export.comments, page(cursor)),
				step("Collecting your comments"),
			);
			const createdFeedback = await collectPages(
				(cursor) => convex.query(api.users.export.createdFeedback, page(cursor)),
				step("Collecting feedback you created"),
			);
			const assignedFeedback = await collectPages(
				(cursor) => convex.query(api.users.export.assignedFeedback, page(cursor)),
				step("Collecting feedback assigned to you"),
			);
			const activity = await collectPages(
				(cursor) => convex.query(api.users.export.activity, page(cursor)),
				step("Collecting your activity"),
			);
			const exportedAt = new Date();
			const fileName = `insightflow-my-data-${exportedAt.toISOString().slice(0, 10)}.json`;
			downloadFile(
				fileName,
				"application/json",
				JSON.stringify(
					{
						exportedAt: exportedAt.toISOString(),
						...account,
						comments,
						createdFeedback,
						assignedFeedback,
						activity,
					},
					null,
					2,
				),
			);
			setExportStatus({ state: "done", fileName });
		} catch (error) {
			setExportStatus({
				state: "error",
				message: errorMessage(error, "We couldn't prepare your data. Try again."),
			});
		}
	}

	function openAccount() {
		setAccountName(profile?.name ?? "");
		setCurrentPassword("");
		setNewPassword("");
		setConfirmPassword("");
		setAccountError(null);
		setAccountNotice(null);
		setIsAccountOpen(true);
	}

	async function handleAccountSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const passwordChanged = newPassword.length > 0;

		if (passwordChanged && newPassword !== confirmPassword) {
			setAccountError("The new passwords do not match.");
			return;
		}
		if (profile?.hasPassword && passwordChanged && !currentPassword) {
			setAccountError("Enter your current password to change it.");
			return;
		}

		setIsSavingAccount(true);
		setAccountError(null);
		setAccountNotice(null);
		try {
			await updateAccount({
				name: accountName,
				...(currentPassword ? { currentPassword } : {}),
				...(newPassword ? { newPassword } : {}),
			});
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
			setAccountNotice("Account changes saved.");
		} catch (error) {
			setAccountError(errorMessage(error, "Unable to save account changes."));
		} finally {
			setIsSavingAccount(false);
		}
	}

	return (
		<>
			<SidebarMenu>
				<SidebarMenuItem>
					<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								size="lg"
								className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
							/>
						}
					>
						<Avatar className="size-8 rounded-full">
							<AvatarFallback className="rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground ring-1 ring-sidebar-border">
								{userInitials}
							</AvatarFallback>
						</Avatar>
						<span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
							<span className="truncate font-medium">{name}</span>
							<span className="truncate text-xs text-sidebar-foreground/60">
								{email}
							</span>
						</span>
						<ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/50" />
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuGroup>
							<DropdownMenuLabel className="p-0 font-normal">
								<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
									<Avatar className="size-8 rounded-full">
										<AvatarFallback className="rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
										{userInitials}
										</AvatarFallback>
									</Avatar>
									<div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
										<span className="truncate font-medium">{name}</span>
										<span className="truncate text-xs text-muted-foreground">
											{email}
										</span>
									</div>
								</div>
							</DropdownMenuLabel>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem onClick={openAccount}>
								<BadgeCheck />
								Account
							</DropdownMenuItem>
							<DropdownMenuItem disabled={isExporting || !profile} onClick={() => void downloadMyData()}>
								<Download />
								{isExporting ? "Preparing your data…" : "Download my data"}
							</DropdownMenuItem>
							<ThemeMenuItem />
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem disabled={isSigningOut} onClick={handleSignOut}>
							<LogOut />
							{isSigningOut ? "Logging out…" : "Log out"}
						</DropdownMenuItem>
					</DropdownMenuContent>
					</DropdownMenu>
				</SidebarMenuItem>
			</SidebarMenu>

			<Dialog open={isAccountOpen} onOpenChange={setIsAccountOpen}>
				<DialogContent className="max-w-lg">
					<form onSubmit={handleAccountSave}>
						<DialogHeader>
							<DialogTitle>Account</DialogTitle>
							<DialogDescription>
								Update your profile and sign-in credentials.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4 px-5 py-1">
							<div className="flex items-center gap-3">
								<Avatar size="lg">
									<AvatarFallback>{userInitials}</AvatarFallback>
								</Avatar>
								<div className="min-w-0">
									<p className="truncate font-medium">{name}</p>
									<p className="truncate text-sm text-muted-foreground">{email}</p>
								</div>
							</div>

							<div className="space-y-1.5">
								<label className="text-sm font-medium" htmlFor="account-name">
									Name
								</label>
								<Input
									id="account-name"
									value={accountName}
									onChange={(event) => setAccountName(event.target.value)}
									autoComplete="name"
									required
								/>
							</div>

							<AccountEmailChange
								currentEmail={profile?.email ?? ""}
								pendingEmail={profile?.pendingEmail ?? null}
								hasPassword={Boolean(profile?.hasPassword)}
							/>

							{profile?.hasPassword ? (
								<div className="space-y-4 border-t pt-4">
									<p className="text-sm font-medium">Change password</p>
									<div className="space-y-1.5">
										<label className="text-sm font-medium" htmlFor="current-password">
											Current password
										</label>
										<Input
											id="current-password"
											type="password"
											value={currentPassword}
											onChange={(event) => setCurrentPassword(event.target.value)}
											autoComplete="current-password"
										/>
									</div>
									<div className="grid gap-4 sm:grid-cols-2">
										<div className="space-y-1.5">
											<label className="text-sm font-medium" htmlFor="new-password">
												New password
											</label>
											<Input
												id="new-password"
												type="password"
												value={newPassword}
												onChange={(event) => setNewPassword(event.target.value)}
												autoComplete="new-password"
												minLength={8}
											/>
										</div>
										<div className="space-y-1.5">
											<label className="text-sm font-medium" htmlFor="confirm-password">
												Confirm password
											</label>
											<Input
												id="confirm-password"
												type="password"
												value={confirmPassword}
												onChange={(event) => setConfirmPassword(event.target.value)}
												autoComplete="new-password"
												minLength={8}
											/>
										</div>
									</div>
								</div>
							) : null}

							{accountError ? (
								<p className="text-sm text-destructive" role="alert">
									{accountError}
								</p>
							) : null}
							{accountNotice ? (
								<p className="text-sm text-muted-foreground" role="status">
									{accountNotice}
								</p>
							) : null}

							<div className="space-y-2 border-t pt-4">
								<p className="text-sm font-medium">Delete account</p>
								<p className="text-xs leading-5 text-muted-foreground">
									Removes your sign-in, sessions and every organization and project membership.
									Your open feedback returns to the unassigned queue; notes you wrote stay as
									&quot;Former member&quot;. If you own an organization, transfer ownership or delete
									it first.
								</p>
								<Button
									type="button"
									size="sm"
									variant="destructive"
									disabled={!profile}
									onClick={() => setIsDeleteOpen(true)}
								>
									<Trash2 data-icon="inline-start" />
									Delete account
								</Button>
							</div>
						</div>
						<DialogFooter>
							<Button type="submit" disabled={isSavingAccount || !profile}>
								{isSavingAccount ? "Saving…" : "Save changes"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
			<ConfirmDialog
				open={isDeleteOpen}
				onOpenChange={(open) => {
					// Never keep the typed password around after the dialog closes.
					if (!open) setDeletePassword("");
					setIsDeleteOpen(open);
				}}
				title="Delete your account?"
				description={
					profile?.hasPassword
						? "This permanently deletes your account and signs you out everywhere. It cannot be undone."
						: "This permanently deletes your account and signs you out everywhere. It cannot be undone. If you signed in more than 10 minutes ago, sign in again first."
				}
				confirmLabel="Delete account"
				pendingLabel="Deleting…"
				confirmText={deleteConfirmation}
				confirmDisabled={Boolean(profile?.hasPassword) && !deletePassword}
				confirmTextLabel={
					profile?.email ? (
						<>
							Type your email <span className="font-semibold">{profile.email}</span> to confirm
						</>
					) : undefined
				}
				onConfirm={confirmDeleteAccount}
			>
				{profile?.hasPassword ? (
					<label className="grid gap-2 text-sm font-medium">
						<span>Current password</span>
						<Input
							type="password"
							value={deletePassword}
							autoComplete="current-password"
							onChange={(event) => setDeletePassword(event.target.value)}
						/>
					</label>
				) : null}
			</ConfirmDialog>
			{/* The dropdown closes on click, so export progress lives here. */}
			<Dialog
				open={exportStatus !== null}
				onOpenChange={(open) => {
					// Closing while running only hides it; the export keeps going.
					if (!open && !isExporting) setExportStatus(null);
				}}
			>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Download my data</DialogTitle>
						<DialogDescription>
							Your profile, comments, feedback and activity, saved as one JSON file.
						</DialogDescription>
					</DialogHeader>
					<div className="px-5">
						{exportStatus?.state === "running" ? (
							<p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="size-4 animate-spin" />
								{exportStatus.step}
							</p>
						) : exportStatus?.state === "done" ? (
							<p role="status" className="text-sm text-dashboard-success">
								Your download has started ({exportStatus.fileName}).
							</p>
						) : exportStatus?.state === "error" ? (
							<p role="alert" className="text-sm text-destructive">
								{exportStatus.message}
							</p>
						) : null}
					</div>
					<DialogFooter>
						{exportStatus?.state === "error" ? (
							<Button variant="outline" onClick={() => void downloadMyData()}>
								Try again
							</Button>
						) : null}
						<Button disabled={isExporting} onClick={() => setExportStatus(null)}>
							{isExporting ? "Preparing…" : "Close"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
