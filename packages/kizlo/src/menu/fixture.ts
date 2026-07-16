import { defineFixture, type SeedContext } from "../cli/wp/types"

const MENU = {
	name: "Primary",
	slug: "primary",
	items: [
		{ label: "Home", url: "/" },
		{ label: "About", url: "/about" },
		{ label: "Contact", url: "/contact" },
	],
}

async function upsertMenu(ctx: SeedContext): Promise<number> {
	const existing = await ctx.service.menus.list({ per_page: 100 })
	if (existing.error) throw existing.error
	const found = existing.data.items.find((menu) => menu.slug === MENU.slug)
	if (found) return found.id

	const created = await ctx.service.menus.create({ name: MENU.name })
	if (created.error) throw created.error
	return created.data.id
}

async function seedItems(ctx: SeedContext, menuId: number): Promise<void> {
	const existing = await ctx.service.menus.items.list({ menus: menuId, per_page: 1 })
	if (existing.error) throw existing.error
	if (existing.data.items.length > 0) return

	for (const item of MENU.items) {
		const created = await ctx.service.menus.items.create({
			menus: menuId,
			title: item.label,
			url: item.url,
			type: "custom",
			status: "publish",
		})
		if (created.error) throw created.error
	}
}

/** Core menu fixture: seeds a `primary` nav menu + items so the menu suite has content to read. */
export function menuFixture() {
	return defineFixture({
		name: "menu",
		async seed(ctx) {
			const menuId = await upsertMenu(ctx)
			await seedItems(ctx, menuId)
			return { menuId }
		},
	})
}
