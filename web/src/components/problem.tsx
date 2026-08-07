import { Container, Wrapper } from "./layout"

const BEFORE = [
	"Copy and metadata live in components",
	"Every edit becomes a ticket, pull request, and deploy",
	"SEO logic gets rebuilt route by route",
]

const AFTER = [
	"Content and SEO live together in WordPress",
	"Your frontend consumes a typed contract",
	"Editors publish while developers keep building",
]

export function Problem() {
	return (
		<Container>
			<Wrapper border="top-bottom" className="grid lg:grid-cols-[0.9fr_1.1fr]" ticks>
				<div className="flex flex-col justify-between gap-10 border-neutral-800 border-b px-6 py-14 sm:px-10 lg:border-r lg:border-b-0 lg:px-12 lg:py-20">
					<div>
						<p className="text-[#6ea8ff] text-xs uppercase tracking-widest">The common problem</p>
						<h2 className="mt-4 max-w-xl text-balance text-3xl tracking-tight sm:text-4xl">
							Hard-coded content is easy to start—and expensive to keep changing.
						</h2>
					</div>

					<p className="max-w-xl text-neutral-400 leading-relaxed sm:text-base">
						When content and SEO live in your codebase, routine publishing work enters the engineering queue. Small edits inherit the cost
						and risk of a software release.
					</p>
				</div>

				<div className="grid sm:grid-cols-2">
					<StateList eyebrow="Without Kizlo" title="Your content is coupled to every release" items={BEFORE} muted />
					<StateList eyebrow="With Kizlo" title="Content becomes part of the system" items={AFTER} />
				</div>
			</Wrapper>
		</Container>
	)
}

function StateList({ eyebrow, title, items, muted = false }: { eyebrow: string; title: string; items: string[]; muted?: boolean }) {
	return (
		<div className="flex min-h-80 flex-col border-neutral-800 border-b p-6 last:border-b-0 sm:border-r sm:border-b-0 sm:p-8 sm:last:border-r-0">
			<p className={muted ? "text-neutral-500 text-xs uppercase tracking-widest" : "text-[#6ea8ff] text-xs uppercase tracking-widest"}>
				{eyebrow}
			</p>
			<h3 className="mt-4 max-w-xs text-balance text-xl tracking-tight">{title}</h3>

			<ol className="mt-8 space-y-4">
				{items.map((item, index) => (
					<li key={item} className="flex gap-3 text-neutral-400 text-sm leading-relaxed">
						<span className={muted ? "font-mono text-neutral-600" : "font-mono text-[#6ea8ff]"}>0{index + 1}</span>
						<span>{item}</span>
					</li>
				))}
			</ol>
		</div>
	)
}
