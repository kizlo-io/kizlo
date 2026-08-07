"use client"

import { Dithering } from "@paper-design/shaders-react"
import { PauseIcon, PlayIcon } from "@phosphor-icons/react/dist/ssr"
import { AnimatePresence, motion, type Variants } from "motion/react"
import Image from "next/image"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Container, Wrapper } from "./layout"

const TABS = ["Edit", "Code", "Display"] as const

// ms each tab stays active before auto-advancing, per tab: [Edit, Code, Display]
const DWELL = [4000, 2800, 4000]

// The one value that travels through all three steps.
const TITLE = "Build without limits"
const DESCRIPTION = "The modern platform for teams to plan, create, and launch content that grows your business."

type Region = { left: number; top: number; width: number; height: number }
type Reveal = { id: string; region: Region; delay: number; duration: number; cover?: string; caret?: boolean }

// Flip to true to outline every reveal region so you can align the boxes to the screenshot.
const DEBUG_REGIONS = false

// Reveal regions for the WordPress screenshot, as % of the image box.
// `width` ends at the last character so the caret lands on the word; `cover` is the
// field's background behind the text (white canvas by default, light gray for the SEO
// preview card). These coordinates need your eyes in the browser — nudge to fit.
const REVEALS: Reveal[] = [
	// Title: typed in the editor heading, then propagates into the SEO fields.
	{
		id: "editor-title",
		region: { left: 13.2, top: 15.2, width: 20, height: 5 },
		delay: 300,
		duration: 900,
	},
	{
		id: "seo-preview-title",
		region: { left: 1.2, top: 48, width: 16, height: 3.6 },
		delay: 300,
		duration: 900,
		cover: "#F6F6F6",
		caret: false,
	},
	{
		id: "seo-input-title",
		region: { left: 2, top: 67.3, width: 11, height: 3 },
		delay: 300,
		duration: 900,
		caret: false,
	},
	// Description: typed in the editor body, then propagates into the SEO / meta fields.
	{
		id: "editor-desc",
		region: { left: 13.2, top: 21.5, width: 45.9, height: 3.6 },
		delay: 1700,
		duration: 1400,
	},
	{
		id: "seo-preview-desc",
		region: { left: 1.2, top: 51.4, width: 41, height: 3 },
		delay: 1700,
		duration: 1400,
		cover: "#F6F6F6",
		caret: false,
	},
	{
		id: "meta-desc",
		region: { left: 1.9, top: 90.6, width: 38.5, height: 3 },
		delay: 1700,
		duration: 1400,
		caret: false,
	},
]

export function HowItWorks() {
	const [active, setActive] = useState(0)
	const [paused, setPaused] = useState(false)
	const reduced = usePrefersReducedMotion()

	useEffect(() => {
		if (paused) return
		const id = setTimeout(() => setActive((a) => (a + 1) % TABS.length), DWELL[active])
		return () => clearTimeout(id)
	}, [active, paused])

	const animate = !reduced

	return (
		<section>
			<Container className="relative overflow-hidden pt-20 sm:pt-28">
				<Wrapper className="relative z-10 mx-auto mb-12 max-w-4xl px-6 text-center sm:mb-16 sm:px-10">
					<p className="text-[#e7a6e0] text-xs uppercase tracking-widest">One change, all the way through</p>
					<h2 className="mt-4 text-balance text-3xl tracking-tight sm:text-4xl">
						Edit in WordPress. Build in TypeScript. Publish everywhere.
					</h2>
					<p className="mx-auto mt-5 max-w-2xl text-balance text-neutral-300 leading-relaxed sm:text-lg">
						Kizlo carries content and SEO from the editor to your application through one typed workflow—without making WordPress your
						frontend.
					</p>
				</Wrapper>

				<div className="relative z-10 mx-auto max-w-6xl rounded-t-xl border border-neutral-400 px-1 pt-1 md:-mb-4">
					<div role="cell" className="relative w-full overflow-hidden rounded-t-xl">
						<div className="relative aspect-2940/1672 w-full">
							<AnimatePresence initial={false}>
								<motion.div
									key={active}
									className="absolute inset-0"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={{ duration: reduced ? 0 : 0.4 }}
								>
									{active === 0 ? (
										<WordPressTab animate={animate} />
									) : active === 1 ? (
										<CodeTab animate={animate} />
									) : (
										<WebsiteTab animate={animate} />
									)}
								</motion.div>
							</AnimatePresence>
						</div>

						<div className="inset-x-0 bottom-8 flex justify-center md:absolute">
							<div className="flex gap-1 bg-neutral-900 p-1">
								{TABS.map((tab, i) => {
									const isActive = i === active

									return (
										<button
											key={tab}
											type="button"
											onClick={() => setActive(i)}
											className={cn(
												"relative cursor-pointer overflow-hidden px-4 py-2 text-xs capitalize transition-colors",
												isActive ? "bg-white text-black" : "text-neutral-500 hover:text-neutral-300",
											)}
										>
											{tab}
											{isActive && animate && !paused && (
												<span
													key={active}
													className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[#0066ff]"
													style={{ animation: `how-progress ${DWELL[active]}ms linear both` }}
												/>
											)}
										</button>
									)
								})}

								<button type="button" className="cursor-pointer px-4 py-2" onClick={() => setPaused((prev) => !prev)}>
									{paused ? <PlayIcon /> : <PauseIcon />}
								</button>
							</div>
						</div>
					</div>
				</div>

				<Dithering
					colorBack="#301c2a"
					colorFront="#ae56a6"
					shape="warp"
					type="4x4"
					size={2.5}
					speed={0.54}
					className="absolute inset-0 size-full"
				/>
			</Container>
		</section>
	)
}

function WordPressTab({ animate }: { animate: boolean }) {
	return (
		<div className="absolute inset-0">
			<Image
				src="/wordpress-editor.png"
				alt="Editing the homepage title and description in WordPress"
				fill
				priority
				sizes="(max-width: 896px) 100vw, 896px"
				className="object-cover object-top-left"
			/>

			{animate &&
				REVEALS.map((r) => (
					<RevealCover
						key={r.id}
						region={r.region}
						delay={r.delay}
						duration={r.duration}
						cover={r.cover}
						caret={r.caret}
						debug={DEBUG_REGIONS}
					/>
				))}
		</div>
	)
}

function RevealCover({
	region,
	delay,
	duration,
	cover = "#ffffff",
	caret = true,
	debug = false,
}: {
	region: Region
	delay: number
	duration: number
	cover?: string
	caret?: boolean
	debug?: boolean
}) {
	const positional: React.CSSProperties = {
		left: `${region.left}%`,
		top: `${region.top}%`,
		width: `${region.width}%`,
		height: `${region.height}%`,
	}

	// Alignment aid: outline the box so it can be nudged onto the screenshot text.
	if (debug) {
		return <div className="pointer-events-none absolute border border-red-500 bg-red-500/25" style={positional} />
	}

	return (
		<div className="pointer-events-none absolute" style={positional}>
			{/* Cover recedes right-to-left, smoothly uncovering the baked-in text like typing. */}
			<div
				className="absolute inset-y-0 right-0 w-full"
				style={{ backgroundColor: cover, animation: `how-wipe ${duration}ms linear ${delay}ms both` }}
			/>
			{/* Caret is hidden until its own delay elapses, rides the receding edge, then fades out. */}
			{caret && (
				<div
					className="absolute inset-y-[15%] w-0.5 bg-neutral-800 opacity-0"
					style={{
						animation: `how-caret ${duration}ms linear ${delay}ms forwards, how-caret-hide 220ms ease-out ${delay + duration}ms forwards`,
					}}
				/>
			)}
		</div>
	)
}

type LineType = "context" | "add" | "del"
const CODE_LINES: { id: string; text: string; type: LineType }[] = [
	{ id: "import", text: `import { client } from "@/lib/kizlo/client"`, type: "add" },
	{ id: "gap-1", text: ``, type: "context" },
	{ id: "fn", text: `export default async function Home() {`, type: "context" },
	{ id: "fetch-open", text: `  const { data: page } = await client.pages.get({`, type: "add" },
	{ id: "fetch-params", text: `    params: { identifier: 67 },`, type: "add" },
	{ id: "fetch-close", text: `  })`, type: "add" },
	{ id: "gap-2", text: ``, type: "context" },
	{ id: "return", text: `  return (`, type: "context" },
	{ id: "main-open", text: `    <main>`, type: "context" },
	{ id: "h1-del", text: `      <h1>Build without limits</h1>`, type: "del" },
	{ id: "p-del", text: `      <p>The modern platform for teams…</p>`, type: "del" },
	{ id: "h1-add", text: `      <h1>{page.title}</h1>`, type: "add" },
	{ id: "p-add", text: `      <p>{page.excerpt}</p>`, type: "add" },
	{ id: "main-close", text: `    </main>`, type: "context" },
	{ id: "return-close", text: `  )`, type: "context" },
	{ id: "fn-close", text: `}`, type: "context" },
]

function CodeTab({ animate }: { animate: boolean }) {
	return (
		<div className="absolute inset-0 flex flex-col bg-neutral-950">
			<div className="flex items-center gap-2 border-neutral-800 border-b px-4 py-3">
				<span className="size-2.5 rounded-full bg-neutral-700" />
				<span className="size-2.5 rounded-full bg-neutral-700" />
				<span className="size-2.5 rounded-full bg-neutral-700" />
				<span className="ml-2 font-mono text-neutral-500 text-xs">app/page.tsx</span>
			</div>

			<div className="flex flex-1 overflow-hidden px-3 sm:px-6">
				<motion.pre
					className="w-full font-mono text-[10px] leading-relaxed sm:text-[13px]"
					initial={animate ? "hidden" : false}
					animate="show"
					variants={{ show: { transition: { delayChildren: 0.4, staggerChildren: 0.07 } } }}
				>
					{CODE_LINES.map((line) => (
						<CodeLine key={line.id} line={line} animate={animate} />
					))}
				</motion.pre>
			</div>
		</div>
	)
}

const lineVariants: Variants = {
	hidden: { opacity: 0, y: 4 },
	show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

function CodeLine({ line, animate }: { line: { text: string; type: LineType }; animate: boolean }) {
	const isAdd = line.type === "add"
	const isDel = line.type === "del"

	const className = cn("-mx-3 flex gap-2 px-3 sm:-mx-6 sm:gap-3 sm:px-6", isAdd && "bg-emerald-500/10", isDel && "bg-red-500/10")

	const inner = (
		<>
			<span className={cn("w-2 select-none text-right", isAdd ? "text-emerald-500" : isDel ? "text-red-500" : "text-transparent")}>
				{isAdd ? "+" : isDel ? "-" : ""}
			</span>
			<span className={cn("whitespace-pre", isAdd ? "text-emerald-300" : isDel ? "text-red-300/80" : "text-neutral-400")}>
				{line.text || " "}
			</span>
		</>
	)

	if (isAdd && animate) {
		return (
			<motion.div className={className} variants={lineVariants}>
				{inner}
			</motion.div>
		)
	}

	return (
		<div className={className} style={isDel && animate ? { animation: `how-strike 500ms ease 1400ms both` } : undefined}>
			{inner}
		</div>
	)
}

const riseVariants: Variants = {
	hidden: { opacity: 0, y: 6 },
	show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

const LOAD_S = 0.85

function WebsiteTab({ animate }: { animate: boolean }) {
	return (
		<div className="absolute inset-0">
			<div className="flex h-full flex-col overflow-hidden rounded-lg bg-white">
				<div className="relative flex items-center gap-2 border-neutral-200 border-b px-4 py-2.5">
					<span className="size-2.5 rounded-full bg-neutral-200" />
					<span className="size-2.5 rounded-full bg-neutral-200" />
					<span className="size-2.5 rounded-full bg-neutral-200" />
					<div className="ml-3 flex-1 rounded bg-neutral-100 px-3 py-1 text-center font-mono text-[10px] text-neutral-400 sm:text-xs">
						kizlo.io
					</div>

					{/* Browser page-load bar: the "reload" that surfaces the new content. */}
					{animate && (
						<motion.span
							className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[#0066ff]"
							initial={{ scaleX: 0, opacity: 1 }}
							animate={{ scaleX: 1, opacity: 0 }}
							transition={{ scaleX: { duration: LOAD_S, ease: "easeOut" }, opacity: { delay: LOAD_S, duration: 0.2 } }}
						/>
					)}
				</div>

				<motion.div
					className="flex flex-1 flex-col items-center justify-center px-6 text-center"
					initial={animate ? "hidden" : false}
					animate="show"
					variants={{ show: { transition: { delayChildren: LOAD_S + 0.1, staggerChildren: 0.25 } } }}
				>
					<motion.h1 variants={riseVariants} className="text-balance font-semibold text-2xl text-neutral-900 tracking-tight sm:text-4xl">
						{TITLE}
					</motion.h1>
					<motion.p variants={riseVariants} className="mt-3 max-w-md text-balance text-neutral-500 text-xs sm:mt-4 sm:text-base">
						{DESCRIPTION}
					</motion.p>
					<motion.div variants={riseVariants} className="mt-5 flex gap-3 sm:mt-6">
						<span className="rounded bg-neutral-900 px-4 py-2 text-white text-xs">Get started</span>
						<span className="rounded border border-neutral-300 px-4 py-2 text-neutral-700 text-xs">Learn more</span>
					</motion.div>
				</motion.div>
			</div>
		</div>
	)
}

function usePrefersReducedMotion() {
	const [reduced, setReduced] = useState(false)

	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
		setReduced(mq.matches)
		const onChange = () => setReduced(mq.matches)
		mq.addEventListener("change", onChange)
		return () => mq.removeEventListener("change", onChange)
	}, [])

	return reduced
}
