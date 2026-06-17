import type { WP_CurrencyFormat } from "kizlo"
import type { WC_Order } from "./types.wc"

export interface WCK_Order extends WC_Order {
	kizlo: {
		currency_format: WP_CurrencyFormat
	}
}
