"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const options = [
	{ value: "system", label: "System theme", icon: Monitor },
	{ value: "light", label: "Light theme", icon: Sun },
	{ value: "dark", label: "Dark theme", icon: Moon },
] as const;

const subscribe = () => () => {};

/** System / light / dark, as in the nextjs.org footer. */
export function LandingThemeSwitch() {
	const { theme, setTheme } = useTheme();
	// The stored theme is only known on the client; render neutral until then.
	const mounted = useSyncExternalStore(subscribe, () => true, () => false);

	return (
		<div role="radiogroup" aria-label="Theme" className="inline-flex rounded-full border border-lp-line p-0.5">
			{options.map((option) => {
				const active = mounted && theme === option.value;
				return (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={active}
						aria-label={option.label}
						onClick={() => setTheme(option.value)}
						className={cn(
							"grid size-7 place-items-center rounded-full transition-colors",
							active ? "bg-lp-surface-2 text-lp-fg" : "text-lp-subtle hover:text-lp-fg",
						)}
					>
						<option.icon aria-hidden="true" className="size-3.5" />
					</button>
				);
			})}
		</div>
	);
}
