<?php

namespace Kizlo\Modules\Settings;

use WP_REST_Request;
use WP_REST_Response;
use Kizlo\Modules\Settings\Site\SiteSettings;
use Kizlo\Support\Variables;
use Kizlo\Modules\Settings\Site\SiteSettingsService;
use Kizlo\Modules\Settings\Brand\BrandSettingsService;
use Kizlo\Modules\Settings\Authors\AuthorsSettingsService;
use Kizlo\Modules\Settings\Crawling\CrawlingSettingsService;
use Kizlo\Modules\Settings\Identity\IdentitySettingsService;
use Kizlo\Modules\Settings\PostType\PostTypeSettingsService;
use Kizlo\Modules\Settings\Taxonomy\TaxonomySettingsService;
use Kizlo\Modules\Settings\Webhook\WebhookSettingsService;
use Kizlo\Modules\Settings\Uploads\UploadsSettingsService;
use Kizlo\Modules\Settings\Headless\HeadlessSettingsService;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\Modules\CustomFields\CustomFieldsValidator;
use Kizlo\Support\Utils;

class SettingsModule
{
    /**
     * Internal, undocumented query flag that opts a `/settings` GET into the
     * admin navigation tree. Absent by default, so SDK consumers never receive
     * (nor pay to compute) the nav; only the plugin admin sends it.
     */
    private const INTERNAL_QUERY_FLAG = '__internals';

    private SiteSettingsService $site;
    private BrandSettingsService $brand;
    private IdentitySettingsService $identity;
    private PostTypeSettingsService $postType;
    private AuthorsSettingsService $authors;
    private TaxonomySettingsService $taxonomy;
    private WebhookSettingsService $webhook;
    private CrawlingSettingsService $crawling;
    private UploadsSettingsService $uploads;
    private HeadlessSettingsService $headless;

    public function __construct()
    {
        $this->site        = new SiteSettingsService();
        $this->brand       = new BrandSettingsService();
        $this->identity    = new IdentitySettingsService();
        $this->postType    = new PostTypeSettingsService();
        $this->taxonomy    = new TaxonomySettingsService();
        $this->authors     = new AuthorsSettingsService();
        $this->webhook     = new WebhookSettingsService();
        $this->crawling    = new CrawlingSettingsService();
        $this->uploads     = new UploadsSettingsService();
        $this->headless    = new HeadlessSettingsService();
    }

    /**
     * Register all settings services and routes.
     */
    public function register(): void
    {
        $this->site->register();
        $this->brand->register();
        $this->identity->register();
        $this->postType->register();
        $this->authors->register();
        $this->taxonomy->register();
        $this->webhook->register();
        $this->crawling->register();
        $this->uploads->register();
        $this->headless->register();

        $this->registerRestRoutes();
    }

    /**
     * Register the combined settings GET route.
     */
    private function registerRestRoutes(): void
    {
        kizlo_register_route([
            'id'        => 'settings',
            'operation' => 'retrieve',
            'methods'   => 'GET',
            'route'     => '/settings',
            'summary'   => 'Retrieve every settings section',

            // The internal nav flag is not declared on purpose. Undeclared
            // parameters still reach the handler, so the admin keeps working
            // while the published contract stays the one SDK callers use.
            'input'     => ['type' => 'object'],
            'responses' => [
                '200' => ['description' => 'Every settings section.', 'body' => ['$ref' => SettingsSchemas::SETTINGS]],
            ],
            'callback'  => function (WP_REST_Request $request) {
                return new WP_REST_Response($this->toResponse($request->get_param(self::INTERNAL_QUERY_FLAG) !== null));
            },
        ]);
    }

    /**
     * Aggregate all settings sections into a single response payload.
     *
     * The admin navigation tree is only computed and attached when $includeNav is
     * true (the plugin admin passes the INTERNAL_QUERY_FLAG). SDK consumers get the
     * plain contract with no nav and no extra work.
     *
     * @return array<string, mixed>
     */
    public function toResponse(bool $includeNav = false): array
    {
        $settings = Utils::getSettings();

        $postTypes  = $this->postType->toResponse($settings->postTypes);
        $taxonomies = $this->taxonomy->toResponse($settings->taxonomies);

        $response = [
            'site'             => $this->site->toResponse($settings->site),
            'brand'            => $this->brand->toResponse($settings->brand),
            'identity'         => $this->identity->toResponse($settings->identity),
            'authors'          => $this->authors->toResponse($settings->authors),
            'post_types'       => $postTypes,
            'taxonomies'       => $taxonomies,
            'crawling'         => $this->crawling->toResponse($settings->crawling),
            'webhook'          => $this->webhook->toResponse($settings->webhook),
            'uploads'          => $this->uploads->toResponse($settings->uploads),
            'headless'         => $this->headless->toResponse($settings->headless),
            'plain_permalinks' => empty(get_option('permalink_structure')),
            'statuses'         => PostTypeSettings::getStatuses(),
        ];

        if ($includeNav) {
            $response['nav'] = (new SettingsNav())->build($postTypes, $taxonomies);
        }

        return $response;
    }

    public function getPluginData()
    {
        return array_merge($this->toResponse(true), [
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
                    'reserved_field_names'  => CustomFieldsValidator::RESERVED_POST_FIELD_NAMES,
                ],
                'taxonomy' => [
                    'path_variables'    => Variables::toJSON('taxonomy_path'),
                    'content_variables' => Variables::toJSON('taxonomy_content'),
                    'default_title_format'  => Variables::DEFAULT_TAX_TITLE_TEMPLATE,
                    'default_desc_format'  => Variables::DEFAULT_TAX_DESC_TEMPLATE,
                    'reserved_field_names'  => CustomFieldsValidator::RESERVED_TERM_FIELD_NAMES,
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
