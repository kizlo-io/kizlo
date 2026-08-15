import type { ActiveWordPressClient } from "../wordpress"
import type { EmailSendParams } from "./service.interface"

export class EmailService {
	private readonly wordpress: ActiveWordPressClient

	constructor(wordpress: ActiveWordPressClient) {
		this.wordpress = wordpress
	}

	public async send(params: EmailSendParams): Promise<void> {
		const { error } = await this.wordpress.email.send(params)
		if (error) throw error
	}
}
