import type { ComponentProps } from "react"
import { type SimpleIcon, siBetterauth, siClerk } from "simple-icons"

function brandIcon(icon: SimpleIcon) {
	function BrandIcon(props: ComponentProps<"svg">) {
		return (
			<svg viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={icon.title} {...props}>
				<path d={icon.path} />
			</svg>
		)
	}
	BrandIcon.displayName = `${icon.title}Icon`
	return BrandIcon
}

export const brandIcons = {
	Clerk: brandIcon(siClerk),
	BetterAuth: brandIcon(siBetterauth),
}

export type BrandIconName = keyof typeof brandIcons
