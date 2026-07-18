import type { WPK_PostEnrichment } from "../post-type/service.interface"
import type { WP_Post } from "../wordpress"

export interface WPK_Post extends WP_Post {
	kizlo: WPK_PostEnrichment
}
