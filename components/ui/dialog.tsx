"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
	return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogContent({
	className,
	children,
	showCloseButton = true,
	...props
}: DialogPrimitive.Popup.Props & { showCloseButton?: boolean }) {
	return (
		<DialogPrimitive.Portal>
			<DialogPrimitive.Backdrop
				className="fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs"
				data-slot="dialog-overlay"
			/>
			<DialogPrimitive.Popup
				className={cn(
					"fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border bg-popover text-sm text-popover-foreground shadow-lg transition duration-200 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
					className,
				)}
				data-slot="dialog-content"
				{...props}
			>
				{children}
				{showCloseButton ? (
					<DialogPrimitive.Close
						render={<Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" />}
					>
						<XIcon />
						<span className="sr-only">Close</span>
					</DialogPrimitive.Close>
				) : null}
			</DialogPrimitive.Popup>
		</DialogPrimitive.Portal>
	);
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="dialog-header" className={cn("p-5 pb-0", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="dialog-footer" className={cn("flex justify-end gap-2 p-5 pt-0", className)} {...props} />;
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
	return <DialogPrimitive.Title data-slot="dialog-title" className={cn("font-heading text-lg font-semibold tracking-[-0.02em]", className)} {...props} />;
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
	return <DialogPrimitive.Description data-slot="dialog-description" className={cn("mt-1 text-sm leading-6 text-muted-foreground", className)} {...props} />;
}

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
};
