<?php

namespace Kizlo\Modules\Settings;

use WP_REST_Response;
use Kizlo\Modules\Settings\Site\SiteSettings;
use Kizlo\Support\Variables;
use Kizlo\Modules\Settings\Site\SiteSettingsService;
use Kizlo\Modules\Settings\Authors\AuthorsSettingsService;
use Kizlo\Modules\Settings\Crawling\CrawlingSettingsService;
use Kizlo\Modules\Settings\Identity\IdentitySettingsService;
use Kizlo\Modules\Settings\PostType\PostTypeSettingsService;
use Kizlo\Modules\Settings\Taxonomy\TaxonomySettingsService;
use Kizlo\Modules\Settings\Integration\IntegrationSettingsService;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\Support\Utils;

class SettingsModule
{
    private SiteSettingsService $site;
    private IdentitySettingsService $identity;
    private PostTypeSettingsService $postType;
    private AuthorsSettingsService $authors;
    private TaxonomySettingsService $taxonomy;
    private IntegrationSettingsService $integration;
    private CrawlingSettingsService $crawling;

    public function __construct()
    {
        $this->site        = new SiteSettingsService();
        $this->identity    = new IdentitySettingsService();
        $this->postType    = new PostTypeSettingsService();
        $this->taxonomy    = new TaxonomySettingsService();
        $this->authors     = new AuthorsSettingsService();
        $this->integration = new IntegrationSettingsService();
        $this->crawling    = new CrawlingSettingsService();
    }

    /**
     * Register all settings services and routes.
     */
    public function register(): void
    {
        $this->site->register();
        $this->identity->register();
        $this->postType->register();
        $this->authors->register();
        $this->taxonomy->register();
        $this->integration->register();
        $this->crawling->register();

        $this->registerRestRoutes();
    }

    /**
     * Register the combined settings GET route.
     */
    private function registerRestRoutes(): void
    {
        kizlo_register_route([
            'methods'  => 'GET',
            'route'    => '/settings',
            'callback' => function () {
                return new WP_REST_Response($this->toResponse());
            },
        ]);
    }

    /**
     * Aggregate all settings sections into a single response payload.
     *
     * @return array<string, mixed>
     */
    public function toResponse(): array
    {
        $settings = Utils::getSettings();

        return array_merge(
            [
                'site'             => $this->site->toResponse($settings->site),
                'identity'         => $this->identity->toResponse($settings->identity),
                'authors'          => $this->authors->toResponse($settings->authors),
                'post_types'       => $this->postType->toResponse($settings->postTypes),
                'taxonomies'       => $this->taxonomy->toResponse($settings->taxonomies),
                'crawling'         => $this->crawling->toResponse($settings->crawling),
                'plain_permalinks' => empty(get_option('permalink_structure')),
                'statuses'         => PostTypeSettings::getStatuses(),
            ],
            $this->integration->toResponse($settings->webhook)
        );
    }

    public function getPluginData()
    {
        return array_merge($this->toResponse(), [
            'constants'   => [
                'site'  => [
                    'title_separators' => SiteSettings::TITLE_SEPARATORS,
                    'default_title_separator' => SiteSettings::DEFAULT_TITLE_SEPARATOR,
                ],
                'post_type' => [
                    'path_variables'    => Variables::toJSON('post_type_path'),
                    'content_variables' => Variables::toJSON('post_type_content'),
                    'default_title_format'  => Variables::DEFAULT_POST_TITLE_TEMPLATE,
                    'default_desc_format'  => Variables::DEFAULT_POST_DESC_TEMPLATE,
                ],
                'taxonomy' => [
                    'path_variables'    => Variables::toJSON('taxonomy_path'),
                    'content_variables' => Variables::toJSON('taxonomy_content'),
                    'default_title_format'  => Variables::DEFAULT_TAX_TITLE_TEMPLATE,
                    'default_desc_format'  => Variables::DEFAULT_TAX_DESC_TEMPLATE,
                ],
                'author' => [
                    'path_variables'    => Variables::toJSON('author_path'),
                    'content_variables' => Variables::toJSON('author_content'),
                    'default_title_format'  => Variables::DEFAULT_AUTHOR_TITLE_TEMPLATE,
                    'default_desc_format'  => Variables::DEFAULT_AUTHOR_DESC_TEMPLATE,
                ],
            ]
        ]);
    }
}
