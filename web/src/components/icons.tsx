import type { ComponentProps } from "react"
import {
	type SimpleIcon,
	siAstro,
	siBetterauth,
	siBun,
	siClerk,
	siDeno,
	siNextdotjs,
	siNodedotjs,
	siReact,
	siSolid,
	siSvelte,
	siTanstack,
	siVuedotjs,
} from "simple-icons"

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
	NextJs: brandIcon(siNextdotjs),
	React: brandIcon(siReact),
	Astro: brandIcon(siAstro),
	Vue: brandIcon(siVuedotjs),
	SvelteKit: brandIcon(siSvelte),
	SolidStart: brandIcon(siSolid),
	TanStackStart: brandIcon(siTanstack),
	Node: brandIcon(siNodedotjs),
	Bun: brandIcon(siBun),
	Deno: brandIcon(siDeno),
}

export type BrandIconName = keyof typeof brandIcons
