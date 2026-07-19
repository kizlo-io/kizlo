import type { WordPressService, WP_CommonErrorCode } from "../wordpress"
import { WP_KIZLO_BASE } from "../wordpress"
import type { EmailSendParams } from "./service.interface"

export class EmailService {
	private readonly wordpress: WordPressService

	constructor(wordpress: WordPressService) {
		this.wordpress = wordpress
	}

	public async send(params: EmailSendParams): Promise<void> {
		const { data, error } = await this.wordpress.post<{ success: boolean }, WP_CommonErrorCode>("/email/send", {
			body: params,
			base: WP_KIZLO_BASE,
		})
		if (error) throw error
		if (!data?.success) throw new Error("Failed to send email")
	}
}
