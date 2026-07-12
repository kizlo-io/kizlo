<?php

namespace Kizlo\Support;

use Kizlo\Modules\Settings\Site\SiteSettings;

class Variables
{
    // ====================================================
    // VARIABLES
    // ====================================================

    const TITLE            = '{{title}}';
    const SEPARATOR        = '{{separator}}';
    const SITE_NAME        = '{{site_name}}';
    const TAGLINE          = '{{tagline}}';
    const CATEGORY         = '{{category}}';
    const DATE             = '{{date}}';
    const MODIFIED_DATE    = '{{modified_date}}';
    const AUTHOR           = '{{author}}';
    const EXCERPT          = '{{excerpt}}';
    const DESCRIPTION      = '{{description}}';
    const SLUG             = '{{slug}}';
    const ID               = '{{id}}';
    const YEAR             = '{{year}}';
    const MONTH            = '{{month}}';
    const DAY              = '{{day}}';
    const NICENAME         = '{{nicename}}';
    const NAME             = '{{name}}';
    const FIRST_NAME       = '{{first_name}}';
    const LAST_NAME        = '{{last_name}}';
    const BIO              = '{{bio}}';
    const JOB_TITLE        = '{{job_title}}';
    const POST_COUNT       = '{{post_count}}';
    const SEARCH_ACTION    = '{{search_term_string}}';
    const PATHNAME         = '{{pathname}}';

    // ====================================================
    // POST TYPE
    // ====================================================

    const DEFAULT_POST_TITLE_TEMPLATE = '{{title}} {{separator}} {{site_name}}';
    const DEFAULT_POST_DESC_TEMPLATE  = '{{excerpt}} — Published on {{date}} by {{author}}';

    const POST_TYPE_PATH_VARIABLES = [
        self::SLUG,
        self::ID,
        self::DATE,
        self::YEAR,
        self::MONTH,
        self::DAY,
        self::AUTHOR,
        self::CATEGORY,
    ];

    private const POST_TYPE_PATH_LABELS = [
        self::SLUG             => ['label' => 'Slug',             'description' => 'The post slug'],
        self::ID               => ['label' => 'ID',               'description' => 'The post ID'],
        self::DATE             => ['label' => 'Date',             'description' => 'Published date (e.g. 2026/04/25)'],
        self::YEAR             => ['label' => 'Year',             'description' => 'Published year (e.g. 2026)'],
        self::MONTH            => ['label' => 'Month',            'description' => 'Published month (e.g. 04)'],
        self::DAY              => ['label' => 'Day',              'description' => 'Published day (e.g. 25)'],
        self::AUTHOR           => ['label' => 'Author',           'description' => 'The post author nicename'],
        self::CATEGORY         => ['label' => 'Category',         'description' => 'The primary category slug'],
    ];

    const POST_TYPE_CONTENT_VARIABLES = [
        self::TITLE,
        self::SEPARATOR,
        self::SITE_NAME,
        self::TAGLINE,
        self::CATEGORY,
        self::DATE,
        self::MODIFIED_DATE,
        self::AUTHOR,
        self::EXCERPT,
    ];

    private const POST_TYPE_CONTENT_LABELS = [
        self::TITLE            => ['label' => 'Title',            'description' => 'The post or page title'],
        self::SEPARATOR        => ['label' => 'Separator',        'description' => 'The title separator character configured in General Settings'],
        self::SITE_NAME        => ['label' => 'Site Name',        'description' => 'Your site\'s name'],
        self::TAGLINE          => ['label' => 'Tagline',          'description' => 'Your site\'s tagline'],
        self::CATEGORY         => ['label' => 'Primary Category', 'description' => 'The primary category slug of the post'],
        self::DATE             => ['label' => 'Date',             'description' => 'The post\'s published date'],
        self::MODIFIED_DATE    => ['label' => 'Modified Date',    'description' => 'The post\'s last modified date'],
        self::AUTHOR           => ['label' => 'Author',           'description' => 'The post author\'s display name'],
        self::EXCERPT          => ['label' => 'Excerpt',          'description' => 'A short excerpt of the post content'],
    ];

    // ====================================================
    // TAXONOMY
    // ====================================================

    const DEFAULT_TAX_TITLE_TEMPLATE = '{{title}} {{separator}} {{site_name}}';
    const DEFAULT_TAX_DESC_TEMPLATE  = '{{description}}';


    private const TAXONOMY_PATH_LABELS = [
        self::SLUG => ['label' => 'Slug', 'description' => 'The term slug'],
        self::ID   => ['label' => 'ID',   'description' => 'The term ID'],
    ];

    const TAXONOMY_PATH_VARIABLES = [
        self::SLUG,
        self::ID,
    ];

    const TAXONOMY_CONTENT_VARIABLES = [
        self::TITLE,
        self::SEPARATOR,
        self::SITE_NAME,
        self::TAGLINE,
        self::DESCRIPTION,
    ];

    private const TAXONOMY_CONTENT_LABELS = [
        self::TITLE       => ['label' => 'Title',       'description' => 'The term name'],
        self::SEPARATOR   => ['label' => 'Separator',   'description' => 'The title separator character configured in General Settings'],
        self::SITE_NAME   => ['label' => 'Site Name',   'description' => 'Your site\'s name'],
        self::TAGLINE     => ['label' => 'Tagline',     'description' => 'Your site\'s tagline'],
        self::DESCRIPTION => ['label' => 'Description', 'description' => 'The term\'s description'],
    ];

    // ====================================================
    // AUTHOR
    // ====================================================

    const DEFAULT_AUTHOR_TITLE_TEMPLATE = '{{name}} {{separator}} {{site_name}}';
    const DEFAULT_AUTHOR_DESC_TEMPLATE  = '{{bio}}';

    const AUTHOR_PATH_VARIABLES = [
        self::NICENAME,
        self::ID,
    ];

    private const AUTHOR_PATH_LABELS = [
        self::NICENAME => ['label' => 'Nicename', 'description' => 'The author\'s URL-safe username'],
        self::ID       => ['label' => 'ID',        'description' => 'The author\'s user ID'],
    ];

    const AUTHOR_CONTENT_VARIABLES = [
        self::NAME,
        self::FIRST_NAME,
        self::LAST_NAME,
        self::BIO,
        self::JOB_TITLE,
        self::POST_COUNT,
        self::SEPARATOR,
        self::SITE_NAME,
        self::TAGLINE,
    ];

    private const AUTHOR_CONTENT_LABELS = [
        self::NAME       => ['label' => 'Name',       'description' => 'The author\'s display name'],
        self::FIRST_NAME => ['label' => 'First Name', 'description' => 'The author\'s first name'],
        self::LAST_NAME  => ['label' => 'Last Name',  'description' => 'The author\'s last name'],
        self::BIO        => ['label' => 'Bio',        'description' => 'The author\'s biographical description'],
        self::JOB_TITLE  => ['label' => 'Job Title',  'description' => 'The author\'s job title'],
        self::POST_COUNT => ['label' => 'Post Count', 'description' => 'The number of posts published by the author'],
        self::SEPARATOR  => ['label' => 'Separator',  'description' => 'The title separator character configured in General Settings'],
        self::SITE_NAME  => ['label' => 'Site Name',  'description' => 'Your site\'s name'],
        self::TAGLINE    => ['label' => 'Tagline',    'description' => 'Your site\'s tagline'],
    ];

    // ====================================================
    // METHODS
    // ====================================================

    /**
     * Resolve variables in a template string.
     *
     * @param string $template
     * @param array  $context
     *
     * @return string
     */
    public static function resolve(string $template, array $context = [], ?SiteSettings $site_settings = null): string
    {
        $replacements = [
            self::TITLE            => $context['title']                   ?? '',
            self::SEPARATOR        => $site_settings ? $site_settings->getTitleSeparator() : '',
            self::SITE_NAME        => $site_settings ? $site_settings->getName()           ?? '' : '',
            self::TAGLINE          => $site_settings ? $site_settings->getTagline()        ?? '' : '',
            self::CATEGORY         => $context['category']                ?? '',
            self::DATE             => $context['date']                    ?? '',
            self::MODIFIED_DATE    => $context['modified_date']            ?? '',
            self::AUTHOR           => $context['author']                  ?? '',
            self::EXCERPT          => $context['excerpt']                 ?? '',
            self::DESCRIPTION      => $context['description']             ?? '',
            self::NAME             => $context['name']                    ?? '',
            self::FIRST_NAME       => $context['first_name']               ?? '',
            self::LAST_NAME        => $context['last_name']               ?? '',
            self::BIO              => $context['bio']                     ?? '',
            self::JOB_TITLE        => $context['job_title']               ?? '',
            self::POST_COUNT       => $context['post_count']              ?? '',
            self::SLUG             => $context['slug']                    ?? '',
            self::ID               => $context['id']                      ?? '',
            self::YEAR             => $context['year']                    ?? '',
            self::MONTH            => $context['month']                   ?? '',
            self::DAY              => $context['day']                     ?? '',
            self::NICENAME         => $context['nicename']                ?? '',
            self::SEARCH_ACTION    => '{search_term_string}',
            self::PATHNAME         => $context['pathname']                ?? ''
        ];

        return trim(str_replace(array_keys($replacements), array_values($replacements), $template));
    }

    /**
     * Get variables for a given context type for API response.
     *
     * @param string $type 'post_type_path' | 'post_type_content' | 'taxonomy_path' | 'taxonomy_content' | 'author_path' | 'author_content'
     *
     * @return array
     */
    public static function toJSON(string $type): array
    {
        [$variables, $data] = match (true) {
            $type === 'post_type_path' => [self::POST_TYPE_PATH_VARIABLES, self::POST_TYPE_PATH_LABELS],
            $type === 'post_type_content' => [self::POST_TYPE_CONTENT_VARIABLES, self::POST_TYPE_CONTENT_LABELS],

            $type === 'taxonomy_path' => [self::TAXONOMY_PATH_VARIABLES,  self::TAXONOMY_PATH_LABELS],
            $type === 'taxonomy_content' => [self::TAXONOMY_CONTENT_VARIABLES,  self::TAXONOMY_CONTENT_LABELS],

            $type === 'author_path' => [self::AUTHOR_PATH_VARIABLES, self::AUTHOR_PATH_LABELS],
            $type === 'author_content' => [self::AUTHOR_CONTENT_VARIABLES, self::AUTHOR_CONTENT_LABELS],

            default => [[], []],
        };

        return array_map(fn(string $variable) => [
            'value'       => $variable,
            'label'       => $data[$variable]['label'],
            'description' => $data[$variable]['description'],
        ], $variables);
    }

    /**
     * Post type content variables filtered to what the post type can actually
     * resolve. Excerpt and author are gated on post-type feature support, and
     * category on the post type being attached to the `category` taxonomy, so
     * the editor never offers a variable that resolves to nothing (e.g.
     * {{excerpt}} on pages).
     *
     * @param string $post_type
     *
     * @return array
     */
    public static function forPostType(string $post_type): array
    {
        return array_values(array_filter(
            self::toJSON('post_type_content'),
            static fn(array $variable): bool => match ($variable['value']) {
                self::EXCERPT  => post_type_supports($post_type, 'excerpt'),
                self::AUTHOR   => post_type_supports($post_type, 'author'),
                self::CATEGORY => is_object_in_taxonomy($post_type, 'category'),
                default        => true,
            }
        ));
    }
}
