/**
 * Shared look for sidebar navigation rows. Active rows carry two cues
 * beyond the background, so the state never depends on color alone: the
 * icon takes the primary color and the label turns medium weight.
 */
export const sidebarItemClass =
	"h-9 gap-2.5 px-2.5 text-sidebar-foreground/80 hover:text-sidebar-foreground data-active:font-medium data-active:text-sidebar-accent-foreground data-active:[&_svg]:text-sidebar-primary [&_svg]:text-sidebar-foreground/55";
