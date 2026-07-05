import { createRoot } from "@wordpress/element"
import { HashRouter } from "react-router-dom"
import { Toaster } from "@/shared/components/ui/sonner"
import App from "./App"

const container = document.getElementById("kizlo-root")

if (container) {
	createRoot(container).render(
		<HashRouter>
			<App />
			<Toaster position="top-right" swipeDirections={["right"]} />
		</HashRouter>,
	)
}
