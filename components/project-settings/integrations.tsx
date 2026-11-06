"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Copy, KeyRound, Pencil, Plus, Send, Trash2, Webhook } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog, errorMessage } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Format = "slack" | "json";
type Event = "feedback.created" | "feedback.critical";

const MAX_WEBHOOKS = 3;
const EVENT_LABELS: Record<Event, string> = {
	"feedback.created": "New feedback",
	"feedback.critical": "Critical feedback",
};
const FORMAT_LABELS: Record<Format, string> = {
	slack: "Slack-compatible",
	json: "Generic JSON",
};

type WebhookValues = { name: string; url: string; format: Format; events: Event[] };

function timeAgo(at: number) {
	const minutes = Math.round((Date.now() - at) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours} h ago`;
	return new Date(at).toLocaleDateString();
}

function Toggle({
	pressed,
	onPressedChange,
	children,
	disabled,
}: {
	readonly pressed: boolean;
	readonly onPressedChange: (pressed: boolean) => void;
	readonly children: React.ReactNode;
	readonly disabled?: boolean;
}) {
	return (
		<Button
			type="button"
			size="sm"
			variant={pressed ? "secondary" : "outline"}
			aria-pressed={pressed}
			disabled={disabled}
			onClick={() => onPressedChange(!pressed)}
		>
			{pressed ? <Check data-icon="inline-start" /> : null}
			{children}
		</Button>
	);
}

function SecretNotice({ secret, onDismiss }: { readonly secret: string; readonly onDismiss: () => void }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="rounded-lg bg-dashboard-warning-soft p-4 text-sm text-dashboard-warning-foreground ring-1 ring-dashboard-warning/25">
			<p className="font-semibold">Copy the signing secret now</p>
			<p className="mt-1 leading-6">
				It will not be shown again. Verify each delivery by computing HMAC-SHA256 of
				<code className="mx-1">{"`${timestamp}.${body}`"}</code>
				with this secret and comparing it to the <code>X-InsightFlow-Signature</code> header.
			</p>
			<div className="mt-3 flex gap-2">
				<Input readOnly value={secret} className="bg-background font-mono text-xs" onFocus={(event) => event.target.select()} />
				<Button
					type="button"
					variant="outline"
					className="bg-background"
					onClick={() => {
						void navigator.clipboard?.writeText(secret).then(() => setCopied(true));
					}}
				>
					{copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
					{copied ? "Copied" : "Copy"}
				</Button>
				<Button type="button" variant="ghost" onClick={onDismiss}>
					Done
				</Button>
			</div>
		</div>
	);
}

/**
 * Add/edit form. When editing, the stored URL is never sent back to the
 * browser (only a masked preview), so an empty URL keeps the current one.
 */
function WebhookForm({
	idPrefix,
	initial,
	editing,
	busy,
	onSubmit,
	onCancel,
}: {
	readonly idPrefix: string;
	readonly initial: WebhookValues;
	readonly editing: boolean;
	readonly busy: boolean;
	readonly onSubmit: (values: WebhookValues) => void;
	readonly onCancel: () => void;
}) {
	const [name, setName] = useState(initial.name);
	const [url, setUrl] = useState(initial.url);
	const [format, setFormat] = useState<Format>(initial.format);
	const [events, setEvents] = useState<Event[]>(initial.events);
	const toggleEvent = (event: Event, on: boolean) =>
		setEvents((current) => (on ? [...new Set([...current, event])] : current.filter((value) => value !== event)));
	const ready = name.trim() !== "" && (editing || url.trim() !== "") && events.length > 0;

	return (
		<form
			className="space-y-4 rounded-lg border p-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (ready && !busy) onSubmit({ name, url: url.trim(), format, events });
			}}
		>
			<label htmlFor={`${idPrefix}-name`} className="grid gap-2 text-sm font-medium">
				Name
				<Input
					id={`${idPrefix}-name`}
					value={name}
					maxLength={60}
					placeholder="#product-feedback"
					onChange={(event) => setName(event.target.value)}
				/>
			</label>
			<label htmlFor={`${idPrefix}-url`} className="grid gap-2 text-sm font-medium">
				URL
				<Input
					id={`${idPrefix}-url`}
					type="url"
					inputMode="url"
					value={url}
					maxLength={2048}
					placeholder={editing ? "Leave empty to keep the current URL" : "https://hooks.slack.com/services/…"}
					onChange={(event) => setUrl(event.target.value)}
				/>
			</label>
			<div className="grid gap-2 text-sm font-medium">
				<span>Format</span>
				<div className="flex flex-wrap gap-2">
					{(["slack", "json"] as const).map((value) => (
						<Toggle key={value} pressed={format === value} onPressedChange={() => setFormat(value)}>
							{FORMAT_LABELS[value]}
						</Toggle>
					))}
				</div>
			</div>
			<div className="grid gap-2 text-sm font-medium">
				<span>Events</span>
				<div className="flex flex-wrap gap-2">
					{(["feedback.created", "feedback.critical"] as const).map((value) => (
						<Toggle key={value} pressed={events.includes(value)} onPressedChange={(on) => toggleEvent(value, on)}>
							{EVENT_LABELS[value]}
						</Toggle>
					))}
				</div>
				<p className="text-xs font-normal text-muted-foreground">
					Critical feedback is feedback received at the top priority. With both events on, a
					critical item is sent once, as critical.
				</p>
			</div>
			<div className="flex gap-2">
				<Button type="submit" disabled={busy || !ready}>
					{editing ? (busy ? "Saving…" : "Save webhook") : busy ? "Adding…" : "Add webhook"}
				</Button>
				<Button type="button" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</form>
	);
}

/**
 * Outgoing webhooks for project administrators (project.manage). Renders
 * nothing for anyone else.
 */
export function ProjectIntegrations({ projectSlug }: { readonly projectSlug: string }) {
	const data = useQuery(api.integrations.webhooks.list, { projectSlug });
	const create = useMutation(api.integrations.webhooks.create);
	const update = useMutation(api.integrations.webhooks.update);
	const remove = useMutation(api.integrations.webhooks.remove);
	const sendTest = useMutation(api.integrations.webhooks.sendTest);
	const rotateSecret = useMutation(api.integrations.webhooks.rotateSecret);
	const [adding, setAdding] = useState(false);
	const [editingId, setEditingId] = useState<Id<"webhooks"> | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [secret, setSecret] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<{ id: Id<"webhooks">; name: string } | null>(null);

	if (!data || (!data.canManage && data.webhooks.length === 0)) return null;
	const { canManage, webhooks } = data;

	const run = async (action: () => Promise<unknown>, done?: string) => {
		if (busy) return;
		setBusy(true);
		setError(null);
		setNotice(null);
		try {
			await action();
			if (done) setNotice(done);
		} catch (cause) {
			setError(errorMessage(cause, "Could not save the webhook. Please try again."));
		} finally {
			setBusy(false);
		}
	};

	const submit = (values: WebhookValues) =>
		run(async () => {
			const result = await create({ projectSlug, ...values });
			setSecret(result.secret);
			setAdding(false);
		});

	const saveEdit = (webhookId: Id<"webhooks">, { url, ...values }: WebhookValues) =>
		run(async () => {
			await update({ projectSlug, webhookId, ...values, ...(url ? { url } : {}) });
			setEditingId(null);
		}, "Webhook saved.");

	return (
		<Card className="gap-0 py-0 shadow-none">
			<CardHeader className="border-b px-5 py-5 sm:px-6">
				<CardTitle className="flex items-center gap-2">
					<Webhook className="size-4" /> Webhooks
				</CardTitle>
				<CardDescription>
					Post new or critical feedback to Slack or your own endpoint (HTTPS only, up to{" "}
					{MAX_WEBHOOKS}). Payloads never include the submitter&apos;s email.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4 px-5 py-5 sm:px-6">
				{error ? (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				) : null}
				{notice ? (
					<p role="status" className="text-sm text-muted-foreground">
						{notice}
					</p>
				) : null}
				{secret ? <SecretNotice secret={secret} onDismiss={() => setSecret(null)} /> : null}

				{webhooks.length === 0 && !adding ? (
					<p className="text-sm text-muted-foreground">No webhooks yet.</p>
				) : null}
				<ul className="divide-y">
					{webhooks.map((hook) => (
						<li key={hook._id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="text-sm font-medium">
										{hook.name}
										<span
											className={`ml-2 inline-flex h-5 items-center rounded-md px-1.5 text-xs font-medium ${
												hook.enabled
													? "bg-dashboard-success-soft text-dashboard-success"
													: "bg-muted text-muted-foreground"
											}`}
										>
											{hook.enabled ? "On" : "Off"}
										</span>
									</p>
									<p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{hook.urlPreview}</p>
									<p className="mt-1 text-xs text-muted-foreground">
										{FORMAT_LABELS[hook.format]} · {hook.events.map((event) => EVENT_LABELS[event]).join(", ")}
									</p>
									{hook.disabledReason ? (
										<p className="mt-1 text-xs text-destructive">{hook.disabledReason}</p>
									) : null}
									<p className="mt-1 text-xs">
										{hook.lastDelivery ? (
											<span className={hook.lastDelivery.ok ? "text-dashboard-success" : "text-destructive"}>
												{hook.lastDelivery.test ? "Test delivery" : "Last delivery"}{" "}
												{hook.lastDelivery.ok ? "succeeded" : "failed"}
												{hook.lastDelivery.status ? ` (HTTP ${hook.lastDelivery.status})` : ""}
												{hook.lastDelivery.error && !hook.lastDelivery.ok ? ` — ${hook.lastDelivery.error}` : ""} ·{" "}
												{timeAgo(hook.lastDelivery.at)}
											</span>
										) : (
											<span className="text-muted-foreground">Nothing delivered yet</span>
										)}
									</p>
								</div>
								{canManage ? (
									<div className="flex flex-wrap gap-2">
										<Button
											type="button"
											size="sm"
											variant="outline"
											disabled={busy}
											onClick={() =>
												void run(
													() => sendTest({ projectSlug, webhookId: hook._id }),
													"Test delivery queued. Its result appears here in a few seconds.",
												)
											}
										>
											<Send data-icon="inline-start" /> Send test
										</Button>
										<Button
											type="button"
											size="sm"
											variant="outline"
											disabled={busy || editingId === hook._id}
											onClick={() => {
												setAdding(false);
												setEditingId(hook._id);
											}}
										>
											<Pencil data-icon="inline-start" /> Edit
										</Button>
										<Button
											type="button"
											size="sm"
											variant="outline"
											disabled={busy}
											onClick={() =>
												void run(() => update({ projectSlug, webhookId: hook._id, enabled: !hook.enabled }))
											}
										>
											{hook.enabled ? "Turn off" : "Turn on"}
										</Button>
										<Button
											type="button"
											size="sm"
											variant="outline"
											disabled={busy}
											onClick={() =>
												void run(async () => {
													const result = await rotateSecret({ projectSlug, webhookId: hook._id });
													setSecret(result.secret);
												})
											}
										>
											<KeyRound data-icon="inline-start" /> New secret
										</Button>
										<Button
											type="button"
											size="sm"
											variant="ghost"
											className="text-destructive hover:text-destructive"
											disabled={busy}
											onClick={() => setDeleting({ id: hook._id, name: hook.name })}
										>
											<Trash2 data-icon="inline-start" /> Delete
										</Button>
									</div>
								) : null}
							</div>
							{canManage && editingId === hook._id ? (
								<WebhookForm
									idPrefix={`webhook-${hook._id}`}
									initial={{ name: hook.name, url: "", format: hook.format, events: [...hook.events] }}
									editing
									busy={busy}
									onSubmit={(values) => void saveEdit(hook._id, values)}
									onCancel={() => setEditingId(null)}
								/>
							) : null}
						</li>
					))}
				</ul>

				{canManage && adding ? (
					<WebhookForm
						idPrefix="webhook-new"
						initial={{ name: "", url: "", format: "slack", events: ["feedback.created"] }}
						editing={false}
						busy={busy}
						onSubmit={(values) => void submit(values)}
						onCancel={() => setAdding(false)}
					/>
				) : null}
				{canManage && !adding && webhooks.length < MAX_WEBHOOKS ? (
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							setEditingId(null);
							setAdding(true);
						}}
					>
						<Plus data-icon="inline-start" /> Add webhook
					</Button>
				) : null}
			</CardContent>
			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={(open) => {
					if (!open) setDeleting(null);
				}}
				title="Delete this webhook?"
				description={
					<>
						<span className="font-medium text-foreground">{deleting?.name}</span> will stop receiving
						deliveries immediately.
					</>
				}
				confirmLabel="Delete webhook"
				pendingLabel="Deleting…"
				onConfirm={async () => {
					if (deleting) await remove({ projectSlug, webhookId: deleting.id });
				}}
			/>
		</Card>
	);
}
