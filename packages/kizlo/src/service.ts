import { EmailService } from "./email/service"
import { SettingsService } from "./settings/service"
import type { WordPressCredentials } from "./wordpress"
import { WordPressService } from "./wordpress"

export interface ServiceConfig {
	credentials: WordPressCredentials
}

export class Service {
	public readonly email: EmailService
	public readonly settings: SettingsService
	public readonly wordpress: WordPressService
	private readonly config: ServiceConfig

	constructor(config: ServiceConfig) {
		this.config = config
		this.email = new EmailService(this)
		this.settings = new SettingsService(this)
		this.wordpress = new WordPressService(this.config)
	}
}
