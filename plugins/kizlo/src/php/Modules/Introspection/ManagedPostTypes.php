<?php

namespace Kizlo\Modules\Introspection;

use WP_Post_Type;
use WP_Taxonomy;
use WP_REST_Attachments_Controller;
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
 * What a type's schemas contain is read off the controller that serves it, not
 * decided here: {@see CoreItemSchema} derives the response and the write surface
 * the same way {@see CoreCollectionParams} derives the list, and {@see CoreControllers}
 * decides which controller that is. Kizlo adds three things on top, and only
 * three. The `kizlo` envelope, which is its own. The configured custom fields,
 * which merge in at the response root exactly where the API puts them. And a name
 * for the `status` vocabulary, so a client gets one type rather than an anonymous
 * enum at every site.
 *
 * The five operations are described for every managed type. `attachment` used to
 * be listed as read-only here, which was true of the route rather than of the
 * resource: it was served through a controller that ignores `$_FILES`, so a create
 * would have written a post row with no file. It is served through the attachments
 * controller now, so what is left of that distinction is the shape of the create
 * body, which {@see createInput()} describes.
 *
 * Deciding supports and hierarchy here was the old way and it disagreed with
 * core, which uses a fixed schema for `post`, `page` and `attachment` and ignores
 * their registered supports entirely.
 */
class ManagedPostTypes
{
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

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function schemas(): array
    {
        $schemas = [];

        foreach (array_keys(self::managed()) as $slug) {
            $fields = Utils::getSettings()->postTypes->get($slug)->getCustomFields();
            $id     = self::apiId($slug);

            $schemas["{$id}.list-item"]       = self::item($slug, $fields, false);
            $schemas["{$id}.item"]            = self::item($slug, $fields, true);
            $schemas["{$id}.delete-response"] = self::deleteResponse($id);
            $schemas["{$id}.create-input"]    = self::input($slug, $fields, false);
            $schemas["{$id}.update-input"]    = self::input($slug, $fields, true);
        }

        return $schemas;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function routes(): array
    {
        $routes = [];

        foreach (array_keys(self::managed()) as $slug) {
            foreach (self::routesFor($slug) as $declaration) {
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
    public static function routesFor(string $slug): array
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
            'input'     => ['type' => 'object', 'properties' => self::listParameters($slug)],
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
                    'password'   => ['type' => 'string', 'description' => 'Password for a password-protected entry.'],
                ],
            ],
            'responses' => [
                '200' => ['description' => 'The entry.', 'body' => ['$ref' => "{$id}.item"]],
                '404' => ['description' => 'Entry not found.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
        ];

        $routes['create'] = [
            'id'        => $id,
            'operation' => 'create',
            'namespace' => KIZLO_API_NAMESPACE,
            'route'     => $collection,
            'methods'   => ['POST'],
            'summary'   => sprintf('Create a %s entry', $slug),
            'input'     => self::createInput($slug, $id),
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

            // JSON even for an upload type. There is no way to replace the binary
            // through PATCH and WordPress does not offer one either: editing an
            // image is the separate `/media/<id>/edit` route.
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
     * Derived from the controller that serves the route. {@see CoreItemSchema}
     * explains why this is no longer written out by hand, and why every field is
     * required.
     *
     * The one thing done to the derived set is naming the `status` vocabulary,
     * for the reason {@see listParameters()} gives: core spells the enum out
     * inline, and a generated client would carry an anonymous copy of it at every
     * site that mentions a status.
     *
     * @param array<int, array<string, mixed>> $fields
     * @return array<string, mixed>
     */
    private static function item(string $slug, array $fields, bool $single): array
    {
        $properties = CoreItemSchema::responseForPostType($slug);

        if (isset($properties['status'])) {
            $properties['status'] = ['$ref' => CoreSchemas::POST_STATUS, 'required' => true];
        }

        $properties['kizlo'] = self::envelope($slug, $properties, $single);

        return [
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
     * What the block carries follows the derived fields rather than the settings:
     * `PostTypeExtension::extendBase()` reads the author off `$data['author']`,
     * so the author summary exists exactly when the response has an author to
     * read.
     *
     * @param array<string, array<string, mixed>> $properties The derived response fields.
     * @return array<string, mixed>
     */
    private static function envelope(string $slug, array $properties, bool $single): array
    {
        $block = [
            'url' => ['type' => 'string', 'required' => true, 'format' => 'uri', 'description' => 'The resolved frontend URL.'],
        ];

        $taxonomies = self::taxonomies($slug);

        if (isset($taxonomies['category'])) {
            $block['categories'] = self::termSummaries('Absent when the entry has no categories.');
        }

        if (isset($taxonomies['post_tag'])) {
            $block['tags'] = self::termSummaries('Absent when the entry has no tags.');
        }

        if (isset($properties['author'])) {
            $block['author'] = [
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

        if (isset($properties['featured_media'])) {
            $block['featured_media'] = [
                '$ref'        => CoreSchemas::MEDIA,
                'description' => 'Absent when the entry has no featured image.',
            ];
        }

        if ($single) {
            $block['seo'] = ['$ref' => CoreSchemas::SEO, 'required' => true];
        }

        $block['extend'] = [
            'type'                 => 'object',
            'required'             => true,
            'additionalProperties' => true,
            'description'          => 'Whatever the kizlo_extend_post_type filters contributed.',
        ];

        return ['type' => 'object', 'required' => true, 'properties' => $block];
    }

    // ============================================================
    // REQUEST SCHEMAS
    // ============================================================

    /**
     * Derived from the same controller, through the same
     * `get_endpoint_args_for_item_schema()` core registers its own write routes
     * with, so a field is writable here exactly when it is writable there.
     *
     * @param array<int, array<string, mixed>> $fields
     * @return array<string, mixed>
     */
    private static function input(string $slug, array $fields, bool $partial): array
    {
        $properties = CoreItemSchema::inputForPostType($slug, $partial);

        if (isset($properties['status'])) {
            $properties['status'] = self::named($properties['status'], 'writable', CoreSchemas::POST_STATUS_WRITABLE);
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
     * The operation input for a create, which is where a body that is not JSON has
     * to be declared.
     *
     * An upload type takes a multipart body carrying the binary in a `file` part,
     * because that is what `WP_REST_Attachments_Controller` reads: `get_file_params()`
     * looks in `$_FILES`, which no JSON body can populate. Describing this create
     * as JSON would be a fresh lie in place of the old one, where the operation was
     * left out of the contract altogether.
     *
     * The `file` property is declared here rather than in the `create-input`
     * schema, and it has to be: {@see Registry} cleans a registered schema with no
     * multipart context, so a `file` inside one is rejected as a type only legal
     * under a multipart body. This is the same place `update` declares its
     * `identifier`, for the same reason — it belongs to the operation rather than
     * to the resource.
     *
     * {@see ArgTranslator} then drops it before registration, so WordPress
     * validates everything except the upload and the controller answers
     * `rest_upload_no_data` when the part is missing.
     *
     * @return array<string, mixed>
     */
    private static function createInput(string $slug, string $id): array
    {
        $input = ['$extends' => "{$id}.create-input", 'type' => 'object'];

        if (!self::uploads($slug)) {
            return $input + ['content_type' => Spec::JSON_CONTENT_TYPE];
        }

        return $input + [
            'content_type' => Spec::MULTIPART_CONTENT_TYPE,
            'properties'   => [
                'file' => [
                    'type'        => 'file',
                    'required'    => true,
                    'description' => 'The file to upload, sent as the "file" part of the multipart body. Every other property is sent as a part of the same body rather than as JSON.',
                ],
            ],
        ];
    }

    /**
     * Whether the route takes an upload, asked of the controller that serves it
     * rather than of the slug.
     *
     * `attachment` is the type core registers this way, but the question is really
     * "does the controller read `$_FILES`", and a post type another plugin
     * registers with an attachments controller answers yes on the same terms.
     */
    private static function uploads(string $slug): bool
    {
        return CoreControllers::forPostType($slug) instanceof WP_REST_Attachments_Controller;
    }

    /**
     * Derived from the controller that serves the route, so the two cannot
     * disagree. {@see CoreCollectionParams} explains why this is no longer
     * written out by hand.
     *
     * The one thing done to the derived set is naming its `status` vocabulary.
     * Core spells the enum out inline, which would reach a generated client as an
     * anonymous union repeated at every site that mentions a status, so the enum
     * is swapped for a reference to {@see CoreSchemas::POST_STATUS_FILTER}.
     *
     * This is not the hand-written override that used to sit here. That one
     * replaced core's vocabulary with a weaker one and could fall behind in
     * silence; this one preserves the set exactly and only gives it a name, which
     * `DerivedParametersTest` pins by comparing the referenced enum against the
     * controller's own.
     *
     * @return array<string, array<string, mixed>>
     */
    private static function listParameters(string $slug): array
    {
        $properties = CoreCollectionParams::forPostType($slug);

        if (isset($properties['status']['items']) && is_array($properties['status']['items'])) {
            $properties['status']['items'] = self::named($properties['status']['items'], 'filter', CoreSchemas::POST_STATUS_FILTER);
        }

        return $properties;
    }

    /**
     * Name a derived vocabulary, but only while it is still the shared one.
     *
     * The status schemas are shared because the vocabularies are global:
     * `register_post_status()` takes no post type. The list filter is the one place
     * that stops being true, and core is what breaks it —
     * `WP_REST_Attachments_Controller::get_collection_params()` narrows the enum to
     * `inherit`, `private` and `trash`, because those are the only statuses an
     * attachment is ever stored with. Referencing the shared schema there would
     * republish the whole vocabulary on a route that rejects almost all of it,
     * which is worse than the anonymous enum the reference exists to avoid: a
     * generated client would offer values guaranteed to 400.
     *
     * So a type that agrees gets the name, and a type that does not keeps core's
     * own enum inline. The comparison is the guard as well as the decision — a
     * shared schema drifting from the controller stops being referenced rather
     * than quietly starting to lie.
     *
     * @param array<string, mixed> $property
     * @param 'writable'|'filter'  $vocabulary
     * @return array<string, mixed>
     */
    private static function named(array $property, string $vocabulary, string $schema): array
    {
        $enum = $property['enum'] ?? null;

        if (!is_array($enum) || array_values($enum) !== array_values(CoreSchemas::statusVocabularies()[$vocabulary])) {
            return $property;
        }

        return ['$ref' => $schema];
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
