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
			<main className="pos-startup-error" role="alert">
				<h1>Kizlo POS could not start</h1>
				<p>The initial store data is missing or invalid. Reload this page to try again.</p>
				<Button type="button" onClick={() => window.location.reload()}>
					Reload POS
				</Button>
			</main>,
		)
	}
}
