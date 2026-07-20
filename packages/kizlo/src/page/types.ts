import type { WPK_PostEnrichment } from "../post-type/service.interface"
import type { WP_Page } from "../wordpress"

export interface WPK_Page extends WP_Page {
	kizlo: WPK_PostEnrichment
}
