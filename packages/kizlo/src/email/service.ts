import type { Service } from "../service"
import type { WP_CommonErrorCode } from "../wordpress"
import { WP_KIZLO_BASE } from "../wordpress"
import type { EmailSendParams } from "./service.interface"

export class EmailService {
	private readonly service: Service

	constructor(service: Service) {
		this.service = service
	}

	public async send(params: EmailSendParams): Promise<void> {
		const { data, error } = await this.service.wordpress.post<{ success: boolean }, WP_CommonErrorCode>("/email/send", {
			body: params,
			base: WP_KIZLO_BASE,
		})
		if (error) throw error
		if (!data?.success) throw new Error("Failed to send email")
	}
}
