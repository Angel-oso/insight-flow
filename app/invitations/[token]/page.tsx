import { AcceptInvitation } from "@/components/invitations/accept-invitation";

export default async function InvitationPage({
	params,
}: {
	readonly params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	return <AcceptInvitation token={token} />;
}
