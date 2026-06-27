import type { CookiesAdapter } from "../shared/types"

/** Author a custom cookies adapter, typed against the {@link CookiesAdapter} contract. */
export function createCookiesAdapter(adapter: CookiesAdapter): CookiesAdapter {
	return adapter
}
