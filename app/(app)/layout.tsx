import { AppNavigation } from "@/components/app-navigation";

export default function MainLayout({
	children,
}: {
	readonly children: React.ReactNode;
}) {
	return (
		<>
			<AppNavigation />
			<main className="flex flex-1 flex-col">{children}</main>
		</>
	);
}
