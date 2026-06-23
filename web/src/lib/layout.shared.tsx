import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { appName, gitConfig } from "./shared"

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			title: (
				<div className="inline-flex items-center gap-2 px-1 font-medium">
					{/* biome-ignore lint/performance/noImgElement: remote SVG; next/image needs dangerouslyAllowSVG (XSS risk) */}
					<img src="https://cdn.kizlo.io/logo/icon-light.svg" alt="" aria-hidden className="hidden h-4 w-4 dark:block" />
					{/* biome-ignore lint/performance/noImgElement: remote SVG; next/image needs dangerouslyAllowSVG (XSS risk) */}
					<img src="https://cdn.kizlo.io/logo/icon-dark.svg" alt="" aria-hidden className="h-4 w-4 dark:hidden" />
					<div>
						{appName} / <span className="text-fd-muted-foreground">docs</span>
					</div>
				</div>
			),
		},
		githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
	}
}
