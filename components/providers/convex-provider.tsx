"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { useState, type ReactNode } from "react";

export function ConvexClientProvider({
	children,
}: {
	readonly children: ReactNode;
}) {
	const [client] = useState(() => {
		const url = process.env.NEXT_PUBLIC_CONVEX_URL;
		if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured.");
		return new ConvexReactClient(url);
	});
	return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>;
}
