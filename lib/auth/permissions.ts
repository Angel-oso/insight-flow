export const roles = ["admin", "manager", "member"] as const;

export type Role = (typeof roles)[number];

export const capabilities = [
	"feedback.view",
	"feedback.triage",
	"feedback.assign",
	"feedback.update",
	"feedback.comment",
	"project.view",
	"project.manage",
	"team.view",
	"team.manage",
	"organization.manage",
] as const;

export type Capability = (typeof capabilities)[number];

export function hasCapability(
	permissions: readonly Capability[],
	capability: Capability,
) {
	return permissions.includes(capability);
}
