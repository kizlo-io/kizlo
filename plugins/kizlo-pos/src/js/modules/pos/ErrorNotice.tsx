import { Button } from "@/components/ui/button"
import type { ApiProblem } from "./api"

export function ErrorNotice({ problem, loginUrl }: { problem: ApiProblem; loginUrl: string }) {
	return (
		<div
			className="pos-error [&_a]:underline! m-0! my-3 shrink-0 rounded-lg border border-[#e99] bg-background p-3 text-[13px] text-foreground [&_a]:inline-block [&_a]:p-2"
			role="alert"
		>
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
