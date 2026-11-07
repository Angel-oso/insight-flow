import type { Metadata } from "next";
import { AcceptInvitation } from "@/components/invitations/accept-invitation";

// The URL is the invitation secret: never index it.
export const metadata: Metadata = {
	title: "Join a project · InsightFlow",
	robots: { index: false, follow: false },
};

export default async function InvitationPage({
	params,
}: {
	readonly params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	return <AcceptInvitation token={token} />;
}
