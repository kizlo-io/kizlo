import { Footer } from "@/components/footer"
import { Header } from "@/components/header"
import { client } from "@/lib/kizlo/server"

export default async function HomeLayout({ children }: LayoutProps<"/docs">) {
	const settings = await client.settings.get.call()
	const header = await client.menus.items.groupList.call({ query: { menus: 3 } })
	const footer = await client.menus.items.groupList.call({ query: { menus: 4 } })

	return (
		<>
			<Header settings={settings} menus={header} />

			{children}

			<Footer settings={settings} menus={footer} />
		</>
	)
}
