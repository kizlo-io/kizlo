import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { gitConfig } from "./shared"

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			title: (
				<div className="mb-1 inline-flex items-center gap-2 px-1 font-medium">
					{/* biome-ignore lint/performance/noImgElement: remote SVG; next/image needs dangerouslyAllowSVG (XSS risk) */}
					<img src="https://cdn.kizlo.io/logo/icon-light.svg" alt="" aria-hidden className="hidden h-4.5 w-4.5 dark:block" />
					{/* biome-ignore lint/performance/noImgElement: remote SVG; next/image needs dangerouslyAllowSVG (XSS risk) */}
					<img src="https://cdn.kizlo.io/logo/icon-dark.svg" alt="" aria-hidden className="h-4.5 w-4.5 dark:hidden" />
					<div>
						kizlo / <span className="text-fd-muted-foreground">docs</span>
					</div>
				</div>
			),
		},
		githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
	}
}
