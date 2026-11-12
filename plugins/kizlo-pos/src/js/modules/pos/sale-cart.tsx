import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { type CartLine, scanCart } from "./checkout-api"

type Draft = { items: CartLine[]; saleId: string; submitted: boolean }
export function restoreCart(value: string | null): Draft | null {
	try {
		const data = JSON.parse(value ?? "null")
		if (
			!data ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.saleId) ||
			!Array.isArray(data.items) ||
			data.items.length > 100
		)
			return null
		if (new Set(data.items.map((item: CartLine) => item.id)).size !== data.items.length) return null
		if (
			data.items.some(
				(item: CartLine) =>
					!Number.isSafeInteger(item.id) ||
					item.id < 1 ||
					!Number.isSafeInteger(item.quantity) ||
					item.quantity < 1 ||
					item.quantity > 10000,
			)
		)
			return null
		return {
			saleId: data.saleId,
			submitted: data.submitted === true,
			items: data.items.map((item: CartLine) => ({ id: item.id, quantity: item.quantity, name: `Item #${item.id}` })),
		}
	} catch {
		return null
	}
}
export function addCartItem(items: CartLine[], item: { id: number; name: string }): CartLine[] {
	const existing = items.find((line) => line.id === item.id)
	if (existing?.quantity === 10000) throw new Error("The item quantity limit has been reached.")
	if (existing) return items.map((line) => (line.id === item.id ? { ...line, quantity: line.quantity + 1, name: item.name } : line))
	if (items.length >= 100) throw new Error("A sale can contain at most 100 different items.")
	return [...items, { ...item, quantity: 1 }]
}
const CartContext = createContext<{
	draft: Draft
	setDraft: React.Dispatch<React.SetStateAction<Draft>>
	add: (item: { id: number; name: string }) => void
	addScanned: (code: string) => Promise<CartLine>
	reset: () => void
} | null>(null)

export function SaleCartProvider({ storageKey, children }: { storageKey: string; children: ReactNode }) {
	const [draft, renderDraft] = useState<Draft>(() => {
		try {
			const saved = restoreCart(localStorage.getItem(storageKey))
			if (saved) return saved
		} catch {
			/* Storage may be blocked. */
		}
		return { items: [], saleId: crypto.randomUUID(), submitted: false }
	})
	const current = useRef(draft)
	const setDraft = useCallback<React.Dispatch<React.SetStateAction<Draft>>>((update) => {
		const next = typeof update === "function" ? update(current.current) : update
		current.current = next
		renderDraft(next)
	}, [])
	useEffect(() => {
		try {
			localStorage.setItem(storageKey, JSON.stringify({ ...draft, items: draft.items.map(({ id, quantity }) => ({ id, quantity })) }))
		} catch {
			/* The current visit still works. */
		}
	}, [draft, storageKey])
	const value = useMemo(
		() => ({
			draft,
			setDraft,
			add: (item: { id: number; name: string }) => {
				if (current.current.submitted) throw new Error("Recover this sale or start the next sale before adding items.")
				const items = addCartItem(current.current.items, item)
				setDraft({ ...current.current, items })
			},
			addScanned: async (code: string) => {
				const snapshot = current.current
				if (snapshot.submitted) throw new Error("Recover this sale or start the next sale before adding items.")
				const item = await scanCart(code, snapshot.items)
				if (current.current !== snapshot) throw new Error("The sale changed. Scan the item again.")
				const items = addCartItem(snapshot.items, item)
				setDraft({ ...snapshot, items })
				return item
			},
			reset: () => setDraft({ items: [], saleId: crypto.randomUUID(), submitted: false }),
		}),
		[draft, setDraft],
	)
	return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
export function useSaleCart() {
	const value = useContext(CartContext)
	if (!value) throw new Error("SaleCartProvider is required")
	return value
}
