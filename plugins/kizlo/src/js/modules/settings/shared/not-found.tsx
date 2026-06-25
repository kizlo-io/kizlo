import { Link } from "react-router-dom"

export function NotFound() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center py-20 text-center">
			<div>
				<h2 className="mb-0 font-semibold text-2xl">Page not found</h2>
				<p className="mt-2 text-muted-foreground">The page you are looking for does not exist.</p>
			</div>

			<Link to="/general/site" className="mt-4 underline">
				Go to settings
			</Link>
		</div>
	)
}
