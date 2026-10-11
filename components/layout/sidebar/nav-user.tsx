"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useQuery } from "convex/react";
import { BadgeCheck, ChevronsUpDown, LogOut } from "lucide-react";
import { useState, type FormEvent } from "react";

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
	const [isAccountOpen, setIsAccountOpen] = useState(false);
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [isSavingAccount, setIsSavingAccount] = useState(false);
	const [accountName, setAccountName] = useState("");
	const [accountEmail, setAccountEmail] = useState("");
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

	function openAccount() {
		setAccountName(profile?.name ?? "");
		setAccountEmail(profile?.email ?? "");
		setCurrentPassword("");
		setNewPassword("");
		setConfirmPassword("");
		setAccountError(null);
		setAccountNotice(null);
		setIsAccountOpen(true);
	}

	async function handleAccountSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const emailChanged = accountEmail.trim().toLowerCase() !== (profile?.email ?? "");
		const passwordChanged = newPassword.length > 0;

		if (passwordChanged && newPassword !== confirmPassword) {
			setAccountError("The new passwords do not match.");
			return;
		}
		if (profile?.hasPassword && (emailChanged || passwordChanged) && !currentPassword) {
			setAccountError("Enter your current password to save these changes.");
			return;
		}

		setIsSavingAccount(true);
		setAccountError(null);
		setAccountNotice(null);
		try {
			await updateAccount({
				name: accountName,
				...(profile?.hasPassword ? { email: accountEmail } : {}),
				...(currentPassword ? { currentPassword } : {}),
				...(newPassword ? { newPassword } : {}),
			});
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
			setAccountNotice("Account changes saved.");
		} catch (error) {
			setAccountError(
				error instanceof Error ? error.message : "Unable to save account changes.",
			);
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

							<div className="space-y-1.5">
								<label className="text-sm font-medium" htmlFor="account-email">
									Email
								</label>
								<Input
									id="account-email"
									type="email"
									value={accountEmail}
									onChange={(event) => setAccountEmail(event.target.value)}
									autoComplete="email"
									disabled={!profile?.hasPassword}
									required
								/>
								{!profile?.hasPassword ? (
									<p className="text-xs text-muted-foreground">
										Your email is managed by your sign-in provider.
									</p>
								) : null}
							</div>

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
						</div>
						<DialogFooter>
							<Button type="submit" disabled={isSavingAccount || !profile}>
								{isSavingAccount ? "Saving…" : "Save changes"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
