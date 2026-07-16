import type { WP_CurrencyFormat, WP_ListMetadata } from "../wordpress"
import type { CurrencyFormat, ListMetadata } from "./schema"
import type { List } from "./types"

export function emptyList<T>(): List<T> {
	return {
		items: [],
		meta: {
			hasNextPage: false,
			hasPrevPage: false,
			nextPage: 0,
			page: 0,
			prevPage: 0,
			totalItems: 0,
			totalPages: 0,
		},
	}
}

export function deserializeListMetadata(data: WP_ListMetadata): ListMetadata {
	return {
		hasNextPage: data.has_next_page,
		hasPrevPage: data.has_prev_page,
		nextPage: data.next_page,
		page: data.page,
		prevPage: data.prev_page,
		totalItems: data.total_items,
		totalPages: data.total_pages,
	}
}

export function serializeCurrencyFormat(data: CurrencyFormat): WP_CurrencyFormat {
	return {
		currency_code: data.currencyCode,
		currency_symbol: data.currencySymbol,

		currency_prefix: data.currencyPrefix,
		currency_suffix: data.currencySuffix,

		currency_minor_unit: data.currencyMinorUnit,

		currency_decimal_separator: data.currencyDecimalSeparator,
		currency_thousand_separator: data.currencyThousandSeparator,
	}
}

export function deserializeCurrencyFormat(data: WP_CurrencyFormat): CurrencyFormat {
	return {
		currencyCode: data.currency_code,
		currencySymbol: data.currency_symbol,

		currencyPrefix: data.currency_prefix,
		currencySuffix: data.currency_suffix,

		currencyMinorUnit: data.currency_minor_unit,

		currencyDecimalSeparator: data.currency_decimal_separator,
		currencyThousandSeparator: data.currency_thousand_separator,
	}
}
