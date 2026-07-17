import type { Fixture } from "../cli/wp/types"
import { menuFixture } from "../menu/fixture"
import { postFixture } from "../post/fixture"

export { menuFixture } from "../menu/fixture"
export { postFixture } from "../post/fixture"

/**
 * The kizlo core content fixtures (posts/comments + menu). Mount these in
 * `kizlo.config.ts` so the framework's own suites have content to read; consumers
 * who only need a clean WP stack can leave them out.
 */
export const coreFixtures: Fixture[] = [postFixture(), menuFixture()]
