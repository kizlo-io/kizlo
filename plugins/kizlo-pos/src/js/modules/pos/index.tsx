import { createRoot } from "@wordpress/element"
import { HashRouter } from "react-router-dom"
import { Button } from "@/components/ui/button"
import App from "./App"
import { configureApi } from "./api"
import { readBootstrap } from "./bootstrap"
import "./styles.css"

const container = document.getElementById("kizlo-pos-root")
if (container) {
	const data = readBootstrap(window.kizloPos)
	const root = createRoot(container)
	if (data) {
		configureApi(data)
		root.render(
			<HashRouter>
				<App data={data} />
			</HashRouter>,
		)
	} else {
		root.render(
			<main
				className="pos-startup-error mx-auto my-15 max-w-150 bg-white p-6 font-sans text-base/[1.6] text-neutral-900 [&_h1]:my-[0.67em] [&_h1]:font-bold [&_h1]:text-[2em] [&_p]:my-4"
				role="alert"
			>
				<h1>Kizlo POS could not start</h1>
				<p>The initial store data is missing or invalid. Reload this page to try again.</p>
				<Button type="button" onClick={() => window.location.reload()}>
					Reload POS
				</Button>
			</main>,
		)
	}
}
