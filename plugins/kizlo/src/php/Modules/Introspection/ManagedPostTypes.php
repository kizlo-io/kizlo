<?php

namespace Kizlo\Modules\Introspection;

use WP_Post_Type;
use WP_Taxonomy;
use Kizlo\Support\Utils;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;

/**
 * Contracts for the post types Kizlo manages.
 *
 * Each managed slug is described at the URL it is callable on, and
 * {@see \Kizlo\Modules\PostType\PostTypeApi} registers the runtime routes from
 * these same declarations. That direction matters: a single generic
 * `/post-types/(?P<post_type>…)` route can only carry one set of arguments,
 * which is no use when supports, hierarchy, connected taxonomies and custom
 * fields all differ per type, so it could enforce none of what is described here.
 *
 * What a type's schemas contain follows from its configuration: enabled supports
 * decide which WordPress fields exist, hierarchy decides whether `parent` does,
 * connected taxonomies add their own arrays, and configured custom fields merge
 * in at the response root exactly where the API puts them.
 */
class ManagedPostTypes
{
    /**
     * Managed post types that can be read through `/post-types/` but not written.
     *
     * `attachment` is a Kizlo-included built-in like `post` and `page`, so it is
     * described. But {@see \Kizlo\Modules\PostType\PostTypeApi} serves it through
     * `WP_REST_Posts_Controller`, which knows nothing about `$_FILES` — an
     * attachment created that way is a row with no file behind it. Listing,
     * retrieving and deleting all work, so those are described and `create` and
     * `update` are not, and neither is registered. Uploads belong on the
     * WordPress media route.
     *
     * @var array<int, string>
     */
    private const READ_ONLY = ['attachment'];

    /**
     * Kizlo-managed post types that are actually callable.
     *
     * `getAvailableObjects()` also returns synthetic objects for Kizlo-owned
     * definitions that are switched off, so the admin can still edit them. Those
     * have no runtime endpoint, and neither does a type whose API access is
     * disabled, so neither is described.
     *
     * @return array<string, WP_Post_Type>
     */
    public static function managed(): array
    {
        $settings = Utils::getSettings();

        $managed = [];

        foreach (PostTypeSettings::getAvailableObjects() as $slug => $object) {
            if (!post_type_exists($slug) || !$settings->postTypes->get($slug)->getAccessEnabled()) {
                continue;
            }

            $managed[$slug] = $object;
        }

        return $managed;
    }

    public static function isWritable(string $slug): bool
    {
        return !in_array($slug, self::READ_ONLY, true);
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function schemas(): array
    {
        $schemas = [];

        foreach (self::managed() as $slug => $object) {
            $fields = Utils::getSettings()->postTypes->get($slug)->getCustomFields();
            $id     = self::apiId($slug);

            $schemas["{$id}.list-item"]       = self::item($slug, $object, $fields, false);
            $schemas["{$id}.item"]            = self::item($slug, $object, $fields, true);
            $schemas["{$id}.delete-response"] = self::deleteResponse($id);

            if (self::isWritable($slug)) {
                $schemas["{$id}.create-input"] = self::input($slug, $object, $fields, false);
                $schemas["{$id}.update-input"] = self::input($slug, $object, $fields, true);
            }
        }

        return $schemas;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function routes(): array
    {
        $routes = [];

        foreach (self::managed() as $slug => $object) {
            foreach (self::routesFor($slug, $object) as $declaration) {
                $routes[] = $declaration;
            }
        }

        return $routes;
    }

    /**
     * One slug's declarations, keyed by operation.
     *
     * Keyed rather than listed because {@see \Kizlo\Modules\PostType\PostTypeApi}
     * registers from exactly this array and has to pair each declaration with the
     * handler that serves it. An operation name is already unique per API, so the
     * key costs nothing.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function routesFor(string $slug, WP_Post_Type $object): array
    {
        $routes     = [];
        $id         = self::apiId($slug);
        $collection = sprintf('/post-types/%s', $slug);
        $single     = kizlo_route(sprintf('/post-types/%s/:identifier', $slug));

        $routes['list'] = [
            'id'        => $id,
            'operation' => 'list',
            'namespace' => KIZLO_API_NAMESPACE,
            'route'     => $collection,
            'methods'   => ['GET'],
            'summary'   => sprintf('List %s entries', $slug),
            'input'     => ['type' => 'object', 'properties' => self::listParameters($slug, $object)],
            'responses' => [
                '200' => [
                    'description' => 'A page of entries.',
                    'headers'     => self::paginationHeaders(),
                    'body'        => ['type' => 'array', 'items' => ['$ref' => "{$id}.list-item"]],
                ],
                '404' => ['description' => 'Post type not found.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
        ];

        $routes['retrieve'] = [
            'id'        => $id,
            'operation' => 'retrieve',
            'namespace' => KIZLO_API_NAMESPACE,
            'route'     => $single,
            'methods'   => ['GET'],
            'summary'   => sprintf('Retrieve a single %s entry', $slug),
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'identifier' => self::identifier(),
                    'context'    => self::context(),
                    'password'   => ['type' => 'string', 'description' => 'Password for a password-protected entry.'],
                ],
            ],
            'responses' => [
                '200' => ['description' => 'The entry.', 'body' => ['$ref' => "{$id}.item"]],
                '404' => ['description' => 'Entry not found.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
        ];

        if (self::isWritable($slug)) {
            $routes['create'] = [
                'id'        => $id,
                'operation' => 'create',
                'namespace' => KIZLO_API_NAMESPACE,
                'route'     => $collection,
                'methods'   => ['POST'],
                'summary'   => sprintf('Create a %s entry', $slug),
                'input'     => ['$extends' => "{$id}.create-input", 'type' => 'object', 'content_type' => Spec::JSON_CONTENT_TYPE],
                'responses' => [
                    '201' => ['description' => 'The created entry.', 'body' => ['$ref' => "{$id}.item"]],
                    '400' => ['description' => 'Invalid request.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                    '404' => ['description' => 'Post type not found.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                ],
            ];

            $routes['update'] = [
                'id'        => $id,
                'operation' => 'update',
                'namespace' => KIZLO_API_NAMESPACE,
                'route'     => $single,
                'methods'   => ['PATCH'],
                'summary'   => sprintf('Update a %s entry', $slug),
                'input'     => [
                    '$extends'     => "{$id}.update-input",
                    'type'         => 'object',
                    'content_type' => Spec::JSON_CONTENT_TYPE,
                    'properties'   => ['identifier' => self::identifier()],
                ],
                'responses' => [
                    '200' => ['description' => 'The updated entry.', 'body' => ['$ref' => "{$id}.item"]],
                    '400' => ['description' => 'Invalid request.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                    '404' => ['description' => 'Entry not found.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                ],
            ];
        }

        $routes['delete'] = [
            'id'        => $id,
            'operation' => 'delete',
            'namespace' => KIZLO_API_NAMESPACE,
            'route'     => $single,
            'methods'   => ['DELETE'],
            'summary'   => sprintf('Delete a %s entry', $slug),
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'identifier' => self::identifier(),
                    'force'      => [
                        'type'        => 'boolean',
                        'default'     => false,
                        'description' => 'Bypass the trash and delete permanently.',
                    ],
                ],
            ],
            'responses' => [
                '200' => ['description' => 'The trashed entry, or the deletion result when forced.', 'body' => ['$ref' => "{$id}.delete-response"]],
                '404' => ['description' => 'Entry not found.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
        ];

        return $routes;
    }

    public static function apiId(string $slug): string
    {
        return 'post-types.' . $slug;
    }

    // ============================================================
    // RESPONSE SCHEMAS
    // ============================================================

    /**
     * @param array<int, array<string, mixed>> $fields
     * @return array<string, mixed>
     */
    private static function item(string $slug, WP_Post_Type $object, array $fields, bool $single): array
    {
        $supports = PostTypeSettings::getSupports($slug);

        $properties = [];

        if ($supports['title']) {
            $properties['title'] = self::rendered();
        }

        if ($supports['editor']) {
            $properties['content'] = self::renderedProtected();
        }

        if ($supports['excerpt']) {
            $properties['excerpt'] = self::renderedProtected();
        }

        if ($supports['author']) {
            $properties['author'] = ['type' => 'integer', 'required' => true];
        }

        if ($supports['thumbnail']) {
            $properties['featured_media'] = ['type' => 'integer', 'required' => true];
        }

        if ($supports['comments']) {
            $properties['comment_status'] = ['type' => 'string', 'required' => true, 'enum' => ['open', 'closed']];
            $properties['ping_status']    = ['type' => 'string', 'required' => true, 'enum' => ['open', 'closed']];
        }

        if ($supports['page-attributes']) {
            $properties['menu_order'] = ['type' => 'integer', 'required' => true];
        }

        if ($supports['post-formats']) {
            $properties['format'] = ['type' => 'string', 'required' => true];
        }

        if ($supports['custom-fields']) {
            $properties['meta'] = ['type' => 'object', 'required' => true, 'additionalProperties' => true];
        }

        if ($object->hierarchical) {
            $properties['parent'] = ['type' => 'integer', 'required' => true];
        }

        if ($slug === 'post') {
            $properties['sticky'] = ['type' => 'boolean', 'required' => true];
        }

        foreach (self::taxonomies($slug) as $taxonomy) {
            $properties[$taxonomy->rest_base ?: $taxonomy->name] = [
                'type'     => 'array',
                'required' => true,
                'items'    => ['type' => 'integer'],
            ];
        }

        $properties['kizlo'] = self::envelope($slug, $supports, $single);

        return [
            '$extends'    => CoreSchemas::POST,
            'type'        => 'object',
            'description' => $single
                ? sprintf('A single "%s" entry.', $slug)
                : sprintf('A "%s" entry as it appears in a list response, without the resolved SEO block.', $slug),

            // Custom fields land at the response root, and a name already taken by
            // a WordPress field is skipped rather than overwritten — which is what
            // CustomFieldsStore::inject() does, so union order matters here.
            'properties'  => $properties + CustomFieldSchema::responseProperties($fields),
        ];
    }

    /**
     * The `kizlo` block the post type extension adds. The resolved SEO block is
     * built only for a single entry, which is the one shape difference between a
     * list item and an item.
     *
     * @param array<string, bool> $supports
     * @return array<string, mixed>
     */
    private static function envelope(string $slug, array $supports, bool $single): array
    {
        $properties = [
            'url' => ['type' => 'string', 'required' => true, 'format' => 'uri', 'description' => 'The resolved frontend URL.'],
        ];

        $taxonomies = self::taxonomies($slug);

        if (isset($taxonomies['category'])) {
            $properties['categories'] = self::termSummaries('Absent when the entry has no categories.');
        }

        if (isset($taxonomies['post_tag'])) {
            $properties['tags'] = self::termSummaries('Absent when the entry has no tags.');
        }

        if ($supports['author']) {
            $properties['author'] = [
                'type'        => 'object',
                'description' => 'Absent when the entry has no author.',
                'properties'  => [
                    'id'         => ['type' => 'integer', 'required' => true],
                    'name'       => ['type' => 'string', 'required' => true],
                    'slug'       => ['type' => 'string', 'required' => true],
                    'avatar_url' => ['type' => 'string', 'required' => true, 'format' => 'uri'],
                ],
            ];
        }

        if ($supports['thumbnail']) {
            $properties['featured_media'] = [
                '$ref'        => CoreSchemas::MEDIA,
                'description' => 'Absent when the entry has no featured image.',
            ];
        }

        if ($single) {
            $properties['seo'] = ['$ref' => CoreSchemas::SEO, 'required' => true];
        }

        $properties['extend'] = [
            'type'                 => 'object',
            'required'             => true,
            'additionalProperties' => true,
            'description'          => 'Whatever the kizlo_extend_post_type filters contributed.',
        ];

        return ['type' => 'object', 'required' => true, 'properties' => $properties];
    }

    // ============================================================
    // REQUEST SCHEMAS
    // ============================================================

    /**
     * @param array<int, array<string, mixed>> $fields
     * @return array<string, mixed>
     */
    private static function input(string $slug, WP_Post_Type $object, array $fields, bool $partial): array
    {
        $supports = PostTypeSettings::getSupports($slug);

        $properties = [
            'date'     => ['type' => 'string', 'nullable' => true, 'format' => 'date-time'],
            'date_gmt' => ['type' => 'string', 'nullable' => true, 'format' => 'date-time'],
            'slug'     => ['type' => 'string'],
            'status'   => ['type' => 'string'],
            'password' => ['type' => 'string'],
            'template' => ['type' => 'string'],
        ];

        if ($supports['title']) {
            $properties['title'] = self::writableText();
        }

        if ($supports['editor']) {
            $properties['content'] = self::writableText();
        }

        if ($supports['excerpt']) {
            $properties['excerpt'] = self::writableText();
        }

        if ($supports['author']) {
            $properties['author'] = ['type' => 'integer'];
        }

        if ($supports['thumbnail']) {
            $properties['featured_media'] = ['type' => 'integer', 'description' => 'Attachment ID.'];
        }

        if ($supports['comments']) {
            $properties['comment_status'] = ['type' => 'string', 'enum' => ['open', 'closed']];
            $properties['ping_status']    = ['type' => 'string', 'enum' => ['open', 'closed']];
        }

        if ($supports['page-attributes']) {
            $properties['menu_order'] = ['type' => 'integer'];
        }

        if ($supports['post-formats']) {
            $properties['format'] = ['type' => 'string'];
        }

        if ($supports['custom-fields']) {
            $properties['meta'] = ['type' => 'object', 'additionalProperties' => true];
        }

        if ($object->hierarchical) {
            $properties['parent'] = ['type' => 'integer'];
        }

        if ($slug === 'post') {
            $properties['sticky'] = ['type' => 'boolean'];
        }

        foreach (self::taxonomies($slug) as $taxonomy) {
            $properties[$taxonomy->rest_base ?: $taxonomy->name] = ['type' => 'array', 'items' => ['type' => 'integer']];
        }

        return [
            'type'        => 'object',
            'description' => $partial
                ? sprintf('A partial update to a "%s" entry. Custom fields are only re-validated when submitted.', $slug)
                : sprintf('A new "%s" entry. Required custom fields must be present.', $slug),
            'properties'  => $properties + CustomFieldSchema::inputProperties($fields, $partial),
        ];
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private static function listParameters(string $slug, WP_Post_Type $object): array
    {
        $supports = PostTypeSettings::getSupports($slug);

        $properties = [
            'context'         => self::context(),
            'page'            => ['type' => 'integer', 'minimum' => 1, 'default' => 1],
            'per_page'        => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100, 'default' => 10],
            'search'          => ['type' => 'string'],
            'after'           => ['type' => 'string', 'format' => 'date-time'],
            'before'          => ['type' => 'string', 'format' => 'date-time'],
            'modified_after'  => ['type' => 'string', 'format' => 'date-time'],
            'modified_before' => ['type' => 'string', 'format' => 'date-time'],
            'include'         => ['type' => 'array', 'items' => ['type' => 'integer']],
            'exclude'         => ['type' => 'array', 'items' => ['type' => 'integer']],
            'offset'          => ['type' => 'integer'],
            'order'           => ['type' => 'string', 'enum' => ['asc', 'desc'], 'default' => 'desc'],
            'orderby'         => [
                'type'    => 'string',
                'enum'    => ['author', 'date', 'id', 'include', 'modified', 'parent', 'relevance', 'slug', 'include_slugs', 'title'],
                'default' => 'date',
            ],
            'slug'            => ['type' => 'array', 'items' => ['type' => 'string']],
            'status'          => ['type' => 'array', 'items' => ['type' => 'string'], 'default' => ['publish']],
        ];

        if ($supports['author']) {
            $properties['author']         = ['type' => 'array', 'items' => ['type' => 'integer']];
            $properties['author_exclude'] = ['type' => 'array', 'items' => ['type' => 'integer']];
        }

        if ($object->hierarchical) {
            $properties['parent']         = ['type' => 'array', 'items' => ['type' => 'integer']];
            $properties['parent_exclude'] = ['type' => 'array', 'items' => ['type' => 'integer']];
        }

        if ($slug === 'post') {
            $properties['sticky'] = ['type' => 'boolean'];
        }

        foreach (self::taxonomies($slug) as $taxonomy) {
            $base                              = $taxonomy->rest_base ?: $taxonomy->name;
            $properties[$base]                 = ['type' => 'array', 'items' => ['type' => 'integer']];
            $properties[$base . '_exclude']    = ['type' => 'array', 'items' => ['type' => 'integer']];
        }

        return $properties;
    }

    // ============================================================
    // SHARED PIECES
    // ============================================================

    /**
     * @return array<string, WP_Taxonomy>
     */
    private static function taxonomies(string $slug): array
    {
        $taxonomies = [];

        foreach (get_object_taxonomies($slug, 'objects') as $name => $taxonomy) {
            if ($taxonomy->show_in_rest) {
                $taxonomies[$name] = $taxonomy;
            }
        }

        return $taxonomies;
    }

    /**
     * @return array<string, mixed>
     */
    private static function identifier(): array
    {
        return [
            'type'        => 'string',
            'required'    => true,
            'description' => 'Numeric ID or slug. The route accepts either, so this is never narrowed to an integer.',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function context(): array
    {
        return ['type' => 'string', 'enum' => ['view', 'embed', 'edit'], 'default' => 'view'];
    }

    /**
     * @return array<string, mixed>
     */
    private static function rendered(): array
    {
        return [
            'type'       => 'object',
            'required'   => true,
            'properties' => ['rendered' => ['type' => 'string', 'required' => true]],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function renderedProtected(): array
    {
        return [
            'type'       => 'object',
            'required'   => true,
            'properties' => [
                'rendered'  => ['type' => 'string', 'required' => true],
                'protected' => ['type' => 'boolean', 'required' => true],
            ],
        ];
    }

    /**
     * WordPress disables argument validation on these fields, so both a plain
     * string and the `{ raw }` object form are accepted.
     *
     * @return array<string, mixed>
     */
    private static function writableText(): array
    {
        return [
            'anyOf' => [
                ['type' => 'string'],
                ['type' => 'object', 'properties' => ['raw' => ['type' => 'string', 'required' => true]]],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function termSummaries(string $description): array
    {
        return [
            'type'        => 'array',
            'description' => $description,
            'items'       => [
                'type'       => 'object',
                'properties' => [
                    'id'   => ['type' => 'integer', 'required' => true],
                    'name' => ['type' => 'string', 'required' => true],
                    'slug' => ['type' => 'string', 'required' => true],
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function paginationHeaders(): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'X-WP-Total'      => ['type' => 'integer', 'required' => true, 'description' => 'Total matching entries.'],
                'X-WP-TotalPages' => ['type' => 'integer', 'required' => true],
            ],
        ];
    }

    /**
     * A delete either trashes the entry, returning it, or removes it for good,
     * returning the deletion result with the entry it removed.
     *
     * @return array<string, mixed>
     */
    private static function deleteResponse(string $id): array
    {
        return [
            'anyOf' => [
                ['$ref' => "{$id}.item"],
                [
                    'type'       => 'object',
                    'properties' => [
                        'deleted'  => ['type' => 'boolean', 'required' => true],
                        'previous' => ['$ref' => "{$id}.item", 'required' => true],
                    ],
                ],
            ],
        ];
    }
}
