import { Button } from "@/components/ui/button"
import type { ApiProblem } from "./api"

export function ErrorNotice({ problem, loginUrl }: { problem: ApiProblem; loginUrl: string }) {
	return (
		<div className="pos-error" role="alert">
			<p>{problem.message}</p>
			{problem.action === "reload" && (
				<Button type="button" onClick={() => window.location.reload()}>
					Reload POS
				</Button>
			)}
			{problem.action === "login" && <a href={loginUrl}>Sign in to WordPress</a>}
		</div>
	)
}
