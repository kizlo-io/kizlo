<?php

namespace Kizlo\Tests\Seo;

use WP_Post;
use Kizlo\Tests\TestCase;
use Kizlo\Modules\Settings\Settings;

/**
 * Base case for the SEO suite.
 *
 * The whole SEO surface resolves through a hydrated {@see Settings} object
 * (site identity, per post-type / taxonomy / author structures, crawling). Rather
 * than drive the admin UI, each test seeds those settings straight into the
 * WordPress options the loaders read, invalidates the settings cache, and gets a
 * fresh `Settings` back. `getBaseUrl()` is pinned to a fixed host so every resolved
 * URL is deterministic regardless of the test site's `home_url`.
 *
 * Also carries fixture factories (attachments with real metadata + alt text, posts
 * with thumbnails, terms, authors) since almost every SEO assertion needs one.
 */
abstract class SeoTestCase extends TestCase
{
    /** Fixed canonical host so resolved URLs never depend on the test site domain. */
    protected const BASE_URL = 'https://example.com';

    /** @id for the WebSite node, mirroring SeoBase::webSiteId(). */
    protected function webSiteId(): string
    {
        return self::BASE_URL . '#website';
    }

    /** @id for the Organization identity node, mirroring SeoBase::organizationId(). */
    protected function orgId(): string
    {
        return self::BASE_URL . '#organization';
    }

    /** @id for the organization logo ImageObject singleton, mirroring SeoBase::logoImageId(). */
    protected function logoImageId(): string
    {
        return self::BASE_URL . '#/schema/logo/image/';
    }

    /** @id for a person node, keyed by the user the way SeoBase::personId() does. */
    protected function personId(int $user_id): string
    {
        $user = get_userdata($user_id);

        return self::BASE_URL . '#/schema/person/' . md5($user->user_login . $user->ID);
    }

    /**
     * Seed plugin settings into their option keys and return a fresh Settings.
     *
     * Overrides are merged section-by-section over sensible defaults, so a test
     * only states what it cares about (e.g. `['post_types' => ['post' => ['article_type' => 'none']]]`).
     * Post-type and taxonomy sections are keyed by slug and merged per slug.
     *
     * @param array<string, mixed> $overrides
     */
    protected function seedSettings(array $overrides = []): Settings
    {
        $site = array_merge([
            'url'                     => self::BASE_URL,
            'name'                    => 'Example Site',
            'alternate_name'          => null,
            'tagline'                 => 'The example tagline',
            'title_separator'         => '|',
            'fallback_image'          => null,
            'search_action_structure' => null,
        ], $overrides['site'] ?? []);

        $identity     = array_merge(['type' => 'organization'], $overrides['identity'] ?? []);
        $organization = array_merge(['name' => 'Example Org'], $overrides['organization'] ?? []);
        $person       = $overrides['person'] ?? [];

        $authors = array_merge([
            'enabled'                  => false,
            'search_engine_visibility' => true,
            'pathname_structure'       => '/author/{{slug}}',
            'title_structure'          => null,
            'description_structure'    => null,
        ], $overrides['authors'] ?? []);

        $postTypes = $this->mergeIndexed([
            'post' => [
                'pathname_structure'       => '/{{slug}}',
                'search_engine_visibility' => true,
                'webpage_type'             => 'WebPage',
                'article_type'             => 'Article',
            ],
            'page' => [
                'pathname_structure'       => '/{{slug}}',
                'search_engine_visibility' => true,
                'webpage_type'             => 'WebPage',
                'article_type'             => 'none',
            ],
        ], $overrides['post_types'] ?? []);

        $taxonomies = $this->mergeIndexed([
            'category' => [
                'pathname_structure'       => '/category/{{slug}}',
                'search_engine_visibility' => true,
                'seo_enabled'              => true,
            ],
            'post_tag' => [
                'pathname_structure'       => '/tag/{{slug}}',
                'search_engine_visibility' => true,
                'seo_enabled'              => true,
            ],
        ], $overrides['taxonomies'] ?? []);

        $robots  = array_merge(['include_sitemap' => true, 'custom_rules' => []], $overrides['robots'] ?? []);
        $sitemap = array_merge(['pathname_structure' => '/sitemap_index.xml'], $overrides['sitemap'] ?? []);

        update_option('kizlo_settings_site', $site);
        update_option('kizlo_settings_identity', $identity);
        update_option('kizlo_settings_identity_person', $person);
        update_option('kizlo_settings_identity_organization', $organization);
        update_option('kizlo_settings_authors', $authors);
        update_option('kizlo_settings_post_types', $postTypes);
        update_option('kizlo_settings_taxonomies', $taxonomies);
        update_option('kizlo_settings_robots', $robots);
        update_option('kizlo_settings_sitemap', $sitemap);

        Settings::invalidateCache();

        return Settings::load();
    }

    /**
     * Merge per-slug override maps over per-slug defaults.
     *
     * @param array<string, array<string, mixed>> $defaults
     * @param array<string, array<string, mixed>> $overrides
     *
     * @return array<string, array<string, mixed>>
     */
    private function mergeIndexed(array $defaults, array $overrides): array
    {
        foreach ($overrides as $slug => $data) {
            $defaults[$slug] = array_merge($defaults[$slug] ?? [], $data);
        }

        return $defaults;
    }

    /**
     * Create an image attachment carrying the metadata the SEO code reads:
     * `_wp_attached_file` (so `wp_get_attachment_url()` resolves), width/height
     * in the attachment metadata, and optional alt text / caption.
     *
     * The post factory injects a default `post_excerpt`, which WordPress treats as
     * the attachment caption; it is cleared here (unless `caption` is passed) so a
     * fixture image has no caption by default.
     *
     * @param array{width?: int, height?: int, alt?: string, caption?: string, mime?: string, file?: string} $args
     */
    protected function createImage(array $args = []): int
    {
        $file = $args['file'] ?? '2026/07/example-image.jpg';

        $id = self::factory()->post->create([
            'post_type'      => 'attachment',
            'post_mime_type' => $args['mime'] ?? 'image/jpeg',
            'post_title'     => 'Example Image',
            'post_excerpt'   => $args['caption'] ?? '',
            'post_status'    => 'inherit',
        ]);

        update_post_meta($id, '_wp_attached_file', $file);
        wp_update_attachment_metadata($id, [
            'file'   => $file,
            'width'  => $args['width'] ?? 1200,
            'height' => $args['height'] ?? 630,
        ]);

        if (!empty($args['alt'])) {
            update_post_meta($id, '_wp_attachment_image_alt', $args['alt']);
        }

        return $id;
    }

    /**
     * Create a published post, optionally with a featured image and SEO overrides.
     *
     * @param array<string, mixed> $args      Passed to the post factory.
     * @param array<string, mixed> $overrides Per-post SEO meta keyed by OVERRIDE_KEYS field.
     */
    protected function createPost(array $args = [], array $overrides = []): WP_Post
    {
        $id = self::factory()->post->create(array_merge([
            'post_type'    => 'post',
            'post_status'  => 'publish',
            'post_title'   => 'Hello World',
            'post_content' => 'Body content.',
        ], $args));

        if (isset($args['thumbnail_id'])) {
            set_post_thumbnail($id, $args['thumbnail_id']);
        }

        $this->applyOverrides($id, $overrides);

        return get_post($id);
    }

    /**
     * Persist per-post SEO overrides directly against their meta keys.
     *
     * @param array<string, mixed> $overrides Keyed by OVERRIDE_KEYS field (e.g. 'noindex', 'title').
     */
    protected function applyOverrides(int $post_id, array $overrides): void
    {
        foreach ($overrides as $field => $value) {
            $meta_key = \Kizlo\Modules\Seo\SeoBase::OVERRIDE_KEYS[$field];
            update_post_meta($post_id, $meta_key, $value);
        }
    }

    /**
     * Persist per-term SEO overrides directly against their term meta keys.
     *
     * @param array<string, mixed> $overrides Keyed by OVERRIDE_KEYS field (e.g. 'noindex', 'title').
     */
    protected function applyTermOverrides(int $term_id, array $overrides): void
    {
        foreach ($overrides as $field => $value) {
            $meta_key = \Kizlo\Modules\Seo\SeoBase::OVERRIDE_KEYS[$field];
            update_term_meta($term_id, $meta_key, $value);
        }
    }

    /** Promote the current user to an administrator (needed for capability-gated paths). */
    protected function actingAsAdmin(): int
    {
        $admin = self::factory()->user->create(['role' => 'administrator']);
        wp_set_current_user($admin);

        return $admin;
    }

    /**
     * Recursively find the first graph node whose `@type` matches (string or in an array).
     *
     * @param array<int, array<string, mixed>> $graph
     *
     * @return array<string, mixed>|null
     */
    protected function findNode(array $graph, string $type): ?array
    {
        foreach ($graph as $node) {
            $node_type = $node['@type'] ?? null;

            if ($node_type === $type) return $node;
            if (is_array($node_type) && in_array($type, $node_type, true)) return $node;
        }

        return null;
    }

    /**
     * Assert an array carries exactly these keys, in this order, and nothing else.
     *
     * This is the backbone of the shape suite: it pins the full contract of a
     * builder's output so a dropped, renamed, reordered, or accidentally-added key
     * fails the test rather than sliding through because only a few keys were read.
     *
     * @param list<string>         $expected Keys in the order the builder emits them.
     * @param array<string, mixed> $actual
     */
    protected function assertShape(array $expected, array $actual, string $message = ''): void
    {
        $this->assertSame(
            $expected,
            array_keys($actual),
            $message ?: 'Array shape drifted. Got keys: [' . implode(', ', array_keys($actual)) . ']'
        );
    }

    /**
     * The ordered list of every graph node's `@type` (string types kept as-is,
     * multi-type arrays joined with `+`), so a test can pin exactly which nodes a
     * scenario emits without caring about their internal fields.
     *
     * @param array<int, array<string, mixed>> $graph
     *
     * @return list<string>
     */
    protected function graphTypes(array $graph): array
    {
        return array_map(function (array $node): string {
            $type = $node['@type'] ?? '(none)';

            return is_array($type) ? implode('+', $type) : $type;
        }, $graph);
    }

    /**
     * Invoke a protected/private method so the low-level builders (buildOg,
     * buildTwitter, buildRobots, ...) can be shape-tested directly with fully
     * controlled arguments, independent of the higher-level resolution around them.
     *
     * @param array<int, mixed> $args
     */
    protected function callProtected(object $object, string $method, array $args = []): mixed
    {
        $ref = new \ReflectionMethod($object, $method);
        $ref->setAccessible(true);

        return $ref->invoke($object, ...$args);
    }
}
