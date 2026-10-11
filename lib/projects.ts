export type Project = {
	readonly slug: string;
	readonly name: string;
	readonly description: string;
};

export function projectPath(projectSlug: string, section: string) {
	return `/projects/${projectSlug}/${section}`;
}
