"use client"

import { CaretDownIcon, ListIcon, XIcon } from "@phosphor-icons/react/dist/ssr"
import type { Settings } from "kizlo"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { cn } from "@/lib/utils"
import type { MenuGroupItemList } from "../../../packages/kizlo/src/menu/schema"

export function Header({
	className,
	settings,
	menus,
	...props
}: React.ComponentProps<"header"> & { settings: Settings; menus: MenuGroupItemList }) {
	const [activeId, setActiveId] = useState<number | null>(null)
	const [open, setOpen] = useState(false)
	const [mobileOpen, setMobileOpen] = useState(false)

	const activeItem = menus.items.find((item) => item.id === activeId && item.hasItems)

	function openItem(id: number) {
		setActiveId(id)
		setOpen(true)
	}

	function toggleItem(id: number) {
		setActiveId(id)
		setOpen((prev) => !prev)
	}

	return (
		<header className={cn("fixed inset-x-0 top-4 z-50 mx-4 md:mx-8", className)} {...props}>
			<div
				role="grid"
				className="relative mx-auto max-w-350"
				onMouseLeave={() => {
					setOpen(false)
					setMobileOpen(false)
				}}
			>
				<div className="flex h-11 items-center justify-between gap-1">
					<div className="flex h-full flex-1 items-center gap-10 bg-white px-4 shadow-2xl">
						<div className="h-max">
							<Link href={"/"} className="shrink-0">
								<Image
									src={settings.brand.logo?.src ?? ""}
									alt={settings.brand.logo?.alt ?? "Kizlo"}
									width={settings.brand.logo?.width ?? 60}
									height={settings.brand.logo?.height ?? 40}
								/>
							</Link>
						</div>

						<ul className="hidden md:flex">
							{menus.items.map((item) => (
								<li
									key={item.id}
									onMouseEnter={() => (item.hasItems ? openItem(item.id) : setOpen(false))}
									className={cn(
										"flex cursor-pointer items-center gap-2 px-5 py-3 font-medium hover:bg-neutral-200",
										open && activeItem?.id === item.id && "bg-neutral-200",
									)}
								>
									{item.hasItems ? (
										<>
											<span>{item.name}</span>
											<CaretDownIcon
												className={cn("transition-transform duration-200 ease-out", open && activeItem?.id === item.id && "rotate-180")}
											/>
										</>
									) : (
										<Link href={item.href} className="flex h-full items-center">
											{item.name}
										</Link>
									)}
								</li>
							))}
						</ul>
					</div>

					<div className="flex h-full gap-1">
						<GithubButton className="hidden md:flex" />

						<GetStartedButton className="hidden md:flex" />

						<button
							type="button"
							className="flex cursor-pointer items-center gap-2 border-l bg-white px-3 font-medium shadow-2xl hover:bg-neutral-200 md:hidden"
							onClick={() => setMobileOpen((prev) => !prev)}
						>
							{mobileOpen ? <XIcon className="size-6" /> : <ListIcon className="size-6" />}
						</button>
					</div>
				</div>

				{/* Dropdown */}
				<div
					className={cn(
						"absolute inset-x-0 top-full transition-all duration-200 ease-out",
						mobileOpen || (open && activeItem) ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
					)}
				>
					<div className="mt-1 bg-white p-4 shadow-lg md:p-6">
						{/* Desktop items */}
						{activeItem && (
							<ul className="hidden grid-cols-3 border-neutral-200 border-t border-l md:grid">
								{activeItem.items.map((child) => (
									<li key={child.id} className="border-neutral-200 border-r border-b hover:bg-black hover:text-white">
										<Link href={child.href} className="flex h-full min-h-40 flex-col gap-1 p-6">
											<span className="font-medium">{child.name}</span>
											{child.description && <span className="max-w-sm text-neutral-500 text-sm">{child.description}</span>}
										</Link>
									</li>
								))}
							</ul>
						)}

						{/* Mobile items */}
						<div className="md:hidden">
							{menus.items.map((item) => (
								<li key={item.id} onClick={() => toggleItem(item.id)} className={cn("cursor-pointer list-none py-3 font-medium text-base")}>
									<div className="flex items-center gap-2">
										{item.hasItems ? (
											<>
												<span>{item.name}</span>
												<CaretDownIcon
													className={cn("transition-transform duration-200 ease-out", open && activeItem?.id === item.id && "rotate-180")}
												/>
											</>
										) : (
											<Link href={item.href} className="flex h-full items-center">
												{item.name}
											</Link>
										)}
									</div>

									{item.id === activeItem?.id && open && (
										<ul className="mt-2 ml-4 select-none">
											{activeItem.items.map((child) => (
												<li key={child.id} className="">
													<Link href={child.href} className="flex h-full flex-col gap-1 py-3">
														<span className="text-sm">{child.name}</span>
													</Link>
												</li>
											))}
										</ul>
									)}
								</li>
							))}

							<div className="mt-4 flex w-full items-center gap-2">
								<GithubButton className="border" />
								<GetStartedButton className="flex-1 justify-center bg-black text-white hover:bg-black" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</header>
	)
}

function GithubButton({ ...props }: React.HTMLAttributes<HTMLElement>) {
	return (
		<Link
			target="_blank"
			href={"https://github.com/kizlo-io/kizlo"}
			className={cn(
				"flex cursor-pointer items-center gap-2 border-l bg-white px-6 py-3 font-medium shadow-2xl hover:bg-neutral-200",
				props.className,
			)}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="currentColor"
				aria-hidden="true"
				className="size-5"
			>
				<path
					fillRule="evenodd"
					clipRule="evenodd"
					d="M11.9317 1C5.91925 1 1 6.07047 1 12.2677C1 17.1973 4.14286 21.4227 8.51553 22.972C9.06211 23.1129 9.19876 22.6903 9.19876 22.4086C9.19876 22.1269 9.19876 21.4227 9.19876 20.4368C6.19255 21.141 5.50932 19.0283 5.50932 19.0283C4.96273 17.7607 4.2795 17.3382 4.2795 17.3382C3.32298 16.6339 4.41615 16.6339 4.41615 16.6339C5.50932 16.7748 6.0559 17.7607 6.0559 17.7607C7.01242 19.5917 8.65217 19.0283 9.19876 18.7466C9.3354 18.0424 9.6087 17.479 9.88199 17.1973C7.42236 16.9156 4.96273 15.9297 4.96273 11.5635C4.96273 10.2959 5.37267 9.30993 6.0559 8.6057C5.91925 8.32401 5.50932 7.19724 6.19255 5.64793C6.19255 5.64793 7.14907 5.36624 9.19876 6.7747C10.0186 6.49301 10.9752 6.35216 11.9317 6.35216C12.8882 6.35216 13.8447 6.49301 14.6646 6.7747C16.7143 5.36624 17.6708 5.64793 17.6708 5.64793C18.2174 7.19724 17.9441 8.32401 17.8075 8.6057C18.4907 9.45078 18.9006 10.4367 18.9006 11.5635C18.9006 15.9297 16.3043 16.7748 13.8447 17.0565C14.2547 17.6199 14.6646 18.3241 14.6646 19.31C14.6646 20.8593 14.6646 21.9861 14.6646 22.4086C14.6646 22.6903 14.8012 23.1129 15.4845 22.972C19.8571 21.4227 23 17.1973 23 12.2677C22.8634 6.07047 17.9441 1 11.9317 1Z"
				></path>
			</svg>
		</Link>
	)
}

function GetStartedButton({ ...props }: React.HTMLAttributes<HTMLElement>) {
	return (
		<Link
			href={"/docs/installation"}
			className={cn(
				"flex cursor-pointer items-center gap-2 border-l bg-white px-6 py-3 font-medium shadow-2xl hover:bg-neutral-200",
				props.className,
			)}
		>
			<span>Get Started</span>
		</Link>
	)
}
