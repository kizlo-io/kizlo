import { RootProvider } from "fumadocs-ui/provider/next"

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
	return <RootProvider>{children}</RootProvider>
}
