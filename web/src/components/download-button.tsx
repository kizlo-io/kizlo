import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/ssr"
import type { PluginSlug } from "@/lib/plugins"
import { cn } from "@/lib/utils"

// Direct download for the latest plugin zip. Points at the clean
// `/plugins/<slug>/download` redirect (302 → GitHub Release) so docs link
// straight to the right artifact instead of the multi-package Releases list.
export function DownloadButton({
	plugin = "kizlo",
	children,
	className,
}: {
	plugin?: PluginSlug
	children?: React.ReactNode
	className?: string
}) {
	return (
		<a
			href={`/plugins/${plugin}/download`}
			className={cn(
				"not-prose inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground text-sm no-underline transition-opacity hover:opacity-90",
				className,
			)}
		>
			<DownloadSimpleIcon className="size-4" weight="bold" />
			{children ?? "Download Latest Release"}
		</a>
	)
}
