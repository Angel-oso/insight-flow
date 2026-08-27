"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function ThemeMenuItem() {
	const { setTheme } = useTheme();

	return (
		<>
			<DropdownMenuItem
				className="dark:hidden"
				onClick={() => setTheme("dark")}
			>
				<Moon />
				Switch to dark mode
			</DropdownMenuItem>
			<DropdownMenuItem
				className="hidden dark:flex"
				onClick={() => setTheme("light")}
			>
				<Sun />
				Switch to light mode
			</DropdownMenuItem>
		</>
	);
}
