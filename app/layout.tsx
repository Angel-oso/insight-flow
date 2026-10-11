import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Manrope } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/providers/convex-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";
import { NuqsAdapter } from "nuqs/adapters/next/app";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const manrope = Manrope({
	variable: "--font-manrope",
	subsets: ["latin"],
});

// Display and UI face of the public landing (Vercel/Next.js language).
const geist = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "InsightFlow",
	description: "Turn feedback into clear, traceable product decisions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={cn(
				"h-full",
				"antialiased",
				geist.variable,
				geistMono.variable,
				"font-sans",
				inter.variable,
				manrope.variable,
			)}
		>
			<body className="flex min-h-full flex-col">
				<ConvexClientProvider>
					<NuqsAdapter>
						<ThemeProvider>{children}</ThemeProvider>
					</NuqsAdapter>
				</ConvexClientProvider>
			</body>
		</html>
	);
}
