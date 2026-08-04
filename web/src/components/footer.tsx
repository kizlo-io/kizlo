import type { Settings } from "kizlo"
import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { MenuGroupItemList } from "../../../packages/kizlo/src/menu/schema"
import { Container, Wrapper } from "./layout"

export function Footer({
	className,
	settings,
	menus,
	...props
}: React.ComponentProps<"footer"> & { settings: Settings; menus: MenuGroupItemList }) {
	const identity = settings.identity
	const name = identity.organization?.name ?? settings.site.name ?? "Kizlo"
	const social = identity.organization?.social_profiles ?? identity.person?.social_profiles ?? []

	const columns = menus.items.filter((item) => item.hasItems)

	return (
		<footer className={cn("bg-black text-white", className)} {...props}>
			<Container>
				<Wrapper className="grid gap-12 px-6 pt-8 md:py-12 lg:grid-cols-[1fr_2fr] lg:px-0" border="top" ticks>
					<div className="flex flex-col gap-4 lg:px-12">
						<Link href={"/"} className="w-max">
							<Image
								src={settings.brand.logo_dark?.src ?? ""}
								alt={settings.brand.logo_dark?.alt ?? name}
								width={settings.brand.logo_dark?.width ?? 80}
								height={settings.brand.logo_dark?.height ?? 40}
							/>
						</Link>

						<p className="mt-5 max-w-xs text-neutral-300 text-sm">{settings.identity.organization?.slogan}</p>
						<p className="max-w-xs text-neutral-500 text-sm">
							© {new Date().getFullYear()} {name}. All rights reserved.
						</p>
					</div>

					<div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-4">
						{columns.map((column) => (
							<div key={column.id} className="flex flex-col gap-4">
								<h3 className="font-medium text-sm">{column.name}</h3>
								<ul className="flex flex-col gap-3">
									{column.items.map((child) => (
										<li key={child.id}>
											<Link href={child.href} target={child.target || undefined} className="text-neutral-400 text-sm hover:text-white">
												{child.name}
											</Link>
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</Wrapper>

				<Wrapper
					className="mt-16 flex flex-col-reverse items-start justify-between gap-4 px-6 py-8 sm:flex-row sm:items-center"
					border="top"
					ticks
				>
					<Link href={"https://github.com/kizlo-io/kizlo/blob/main/LICENSE"} className="text-neutral-500 text-sm hover:text-white">
						Apache 2.0 License © 2026
					</Link>
					{social.length > 0 && (
						<ul className="flex flex-wrap gap-x-6 gap-y-2">
							{social.map((profile) => (
								<li key={profile.url}>
									<Link
										href={profile.url}
										target="_blank"
										rel="noopener noreferrer"
										className="text-neutral-500 text-sm capitalize hover:text-black"
									>
										{profile.platform}
									</Link>
								</li>
							))}
						</ul>
					)}
				</Wrapper>
			</Container>
		</footer>
	)
}
