<?php

namespace Kizlo\Modules\Webhook;


class Webhook
{
    const POST_CREATED_EVENT = 'post.created';
    const POST_UPDATED_EVENT = 'post.updated';
    const POST_DELETED_EVENT = 'post.deleted';
    const POST_TRASHED_EVENT = 'post.trashed';

    const TERM_CREATED_EVENT = 'term.created';
    const TERM_UPDATED_EVENT = 'term.updated';
    const TERM_DELETED_EVENT = 'term.deleted';

    const SETTINGS_SITE_UPDATED_EVENT = 'settings.site.updated';
    const SETTINGS_BRAND_UPDATED_EVENT = 'settings.brand.updated';
    const SETTINGS_IDENTITY_UPDATED_EVENT = 'settings.identity.updated';
    const SETTINGS_AUTHORS_UPDATED_EVENT = 'settings.authors.updated';
    const SETTINGS_CRAWLING_UPDATED_EVENT = 'settings.crawling.updated';
    const SETTINGS_HEADLESS_UPDATED_EVENT = 'settings.headless.updated';
    const SETTINGS_POST_TYPE_UPDATED_EVENT = 'settings.post_type.updated';
    const SETTINGS_TAXONOMY_UPDATED_EVENT = 'settings.taxonomy.updated';
    const SETTINGS_INTEGRATION_UPDATED_EVENT = 'settings.integration.updated';

    const REGISTRATION_CREATED_EVENT = 'registration.created';
    const REGISTRATION_UPDATED_EVENT = 'registration.updated';
    const REGISTRATION_DELETED_EVENT = 'registration.deleted';

    const WEBHOOK_PATH = '/webhooks';

    /** True when every current target has a durable job; not a delivery acknowledgement. */
    public static function sendEvent(string $type, array|null $data = null): bool
    {
        return WebhookModule::enqueue($type, $data);
    }
}
