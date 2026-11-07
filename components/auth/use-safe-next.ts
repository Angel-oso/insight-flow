"use client";

import { useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next";

/** Sanitized `?next=` of the current page, or null. */
export function useSafeNext() {
	const searchParams = useSearchParams();
	return safeNextPath(searchParams.get("next"));
}
