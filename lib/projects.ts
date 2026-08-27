export type Project = {
	readonly slug: string;
	readonly name: string;
	readonly description: string;
};

export const projects = [
	{
		slug: "client-portal",
		name: "Client Portal",
		description: "Customer workspace and organization access.",
	},
	{
		slug: "mobile-app",
		name: "Mobile App",
		description: "Mobile customer experience and checkout flows.",
	},
	{
		slug: "academy",
		name: "Academy",
		description: "Learning experience and course progression.",
	},
] as const satisfies readonly Project[];

export const defaultProjectSlug = projects[0].slug;

export function getProjectBySlug(slug: string): Project {
	const project = projects.find((candidate) => candidate.slug === slug);

	if (project) return project;

	return {
		slug,
		name: slug
			.split("-")
			.filter(Boolean)
			.map((word) => `${word[0]?.toUpperCase()}${word.slice(1)}`)
			.join(" "),
		description: "Project workspace created for this demo.",
	};
}

export function projectPath(projectSlug: string, section: string) {
	return `/projects/${projectSlug}/${section}`;
}
