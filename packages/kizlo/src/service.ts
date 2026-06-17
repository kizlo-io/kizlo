import { EmailService } from "./email/service"
import { WordPressService } from "./wordpress/service"
import type { WordPressCredentials } from "./wordpress/types"

export interface ServiceConfig {
	credentials: WordPressCredentials
}

export class Service {
	public readonly email: EmailService
	public readonly wordpress: WordPressService
	private readonly config: ServiceConfig

	constructor(config: ServiceConfig) {
		this.config = config
		this.email = new EmailService(this)
		this.wordpress = new WordPressService(this.config)
	}
}
