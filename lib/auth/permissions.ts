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

const roleCapabilities: Record<Role, readonly Capability[]> = {
	admin: capabilities,
	manager: [
		"feedback.view",
		"feedback.triage",
		"feedback.assign",
		"feedback.update",
		"feedback.comment",
		"project.view",
		"team.view",
	],
	member: [
		"feedback.view",
		"feedback.update",
		"feedback.comment",
		"project.view",
	],
};

export function hasCapability(role: Role, capability: Capability) {
	return roleCapabilities[role].includes(capability);
}
