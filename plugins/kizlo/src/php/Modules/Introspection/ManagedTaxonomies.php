<?php

namespace Kizlo\Modules\Introspection;

use WP_Taxonomy;
use Kizlo\Support\Utils;
use Kizlo\Modules\Settings\Taxonomy\TaxonomySettings;

/**
 * Contracts for the taxonomies Kizlo manages.
 *
 * The same approach as {@see ManagedPostTypes}: each managed slug is described at
 * the URL it is callable on, and {@see \Kizlo\Modules\Taxonomy\TaxonomyApi}
 * registers the runtime routes from these declarations. Hierarchy is the
 * shape-changing option here — it decides whether a term carries `parent` and
 * whether the list accepts a parent filter.
 */
class ManagedTaxonomies
{
    /**
     * @return array<string, WP_Taxonomy>
     */
    public static function managed(): array
    {
        $settings = Utils::getSettings();

        $managed = [];

        foreach (TaxonomySettings::getAvailableObjects() as $slug => $object) {
            if (!taxonomy_exists($slug) || !$settings->taxonomies->get($slug)->getAccessEnabled()) {
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
            $fields = Utils::getSettings()->taxonomies->get($slug)->getCustomFields();
            $id     = self::apiId($slug);

            $schemas["{$id}.list-item"]       = self::item($slug, $fields, false);
            $schemas["{$id}.item"]            = self::item($slug, $fields, true);
            $schemas["{$id}.create-input"]    = self::input($slug, $fields, false);
            $schemas["{$id}.update-input"]    = self::input($slug, $fields, true);
            $schemas["{$id}.delete-response"] = self::deleteResponse($id);
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
     * @see ManagedPostTypes::routesFor() for why the key is there.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function routesFor(string $slug): array
    {
        $id         = self::apiId($slug);
        $collection = sprintf('/taxonomies/%s', $slug);
        $single     = kizlo_route(sprintf('/taxonomies/%s/:identifier', $slug));
        $write      = [
            'id'        => $id,
            'namespace' => KIZLO_API_NAMESPACE,
            'route'     => $single,
            'summary'   => sprintf('Update a %s term', $slug),
            'input'     => [
                '$extends'     => "{$id}.update-input",
                'type'         => 'object',
                'content_type' => Spec::JSON_CONTENT_TYPE,
                'properties'   => ['identifier' => self::identifier()],
            ],
            'responses' => [
                '200' => ['description' => 'The updated term.', 'body' => ['$ref' => "{$id}.item"]],
                '400' => ['description' => 'Invalid request.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                '404' => ['description' => 'Term not found.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
        ];

        return [
            'list' => [
                'id'        => $id,
                'operation' => 'list',
                'namespace' => KIZLO_API_NAMESPACE,
                'route'     => $collection,
                'method'    => 'GET',
                'summary'   => sprintf('List %s terms', $slug),
                // Derived from the controller that serves the route, so the two
                // cannot disagree. {@see CoreCollectionParams} explains why this
                // is no longer written out by hand.
                'input'     => ['type' => 'object', 'properties' => CoreCollectionParams::forTaxonomy($slug)],
                'responses' => [
                    '200' => [
                        'description' => 'A page of terms.',
                        'headers'     => ManagedPostTypes::paginationHeaders(),
                        'body'        => ['type' => 'array', 'items' => ['$ref' => "{$id}.list-item"]],
                    ],
                    '404' => ['description' => 'Taxonomy not found.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                ],
            ],

            'retrieve' => [
                'id'        => $id,
                'operation' => 'retrieve',
                'namespace' => KIZLO_API_NAMESPACE,
                'route'     => $single,
                'method'    => 'GET',
                'summary'   => sprintf('Retrieve a single %s term', $slug),
                'input'     => [
                    'type'       => 'object',
                    'properties' => ['identifier' => self::identifier()],
                ],
                'responses' => [
                    '200' => ['description' => 'The term.', 'body' => ['$ref' => "{$id}.item"]],
                    '404' => ['description' => 'Term not found.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                ],
            ],

            'create' => [
                'id'        => $id,
                'operation' => 'create',
                'namespace' => KIZLO_API_NAMESPACE,
                'route'     => $collection,
                'method'    => 'POST',
                'summary'   => sprintf('Create a %s term', $slug),
                'input'     => ['$extends' => "{$id}.create-input", 'type' => 'object', 'content_type' => Spec::JSON_CONTENT_TYPE],
                'responses' => [
                    '201' => ['description' => 'The created term.', 'body' => ['$ref' => "{$id}.item"]],
                    '400' => ['description' => 'Invalid request.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                    '404' => ['description' => 'Taxonomy not found.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                ],
            ],

            'update' => [
                'operation' => 'update',
                'method'    => 'PATCH',
            ] + $write,

            'replace' => [
                'operation' => 'replace',
                'method'    => 'PUT',
            ] + $write,

            'delete' => [
                'id'        => $id,
                'operation' => 'delete',
                'namespace' => KIZLO_API_NAMESPACE,
                'route'     => $single,
                'method'    => 'DELETE',
                'summary'   => sprintf('Delete a %s term', $slug),
                'input'     => [
                    'type'       => 'object',
                    'properties' => [
                        'identifier' => self::identifier(),
                        'force'      => [
                            'type'        => 'boolean',
                            'default'     => false,
                            'description' => 'Required. Terms do not support trashing, so a delete is always permanent.',
                        ],
                    ],
                ],
                'responses' => [
                    '200' => ['description' => 'The deletion result.', 'body' => ['$ref' => "{$id}.delete-response"]],
                    '404' => ['description' => 'Term not found.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                ],
            ],
        ];
    }

    public static function apiId(string $slug): string
    {
        return 'taxonomies.' . $slug;
    }

    // ============================================================
    // RESPONSE SCHEMAS
    // ============================================================

    /**
     * Derived from `WP_REST_Terms_Controller::get_item_schema()`, so hierarchy
     * still decides whether `parent` exists, but core decides it rather than this
     * file. {@see CoreItemSchema} explains the derivation and the pinned context.
     *
     * @param array<int, array<string, mixed>> $fields
     * @return array<string, mixed>
     */
    private static function item(string $slug, array $fields, bool $single): array
    {
        $properties = CoreItemSchema::responseForTaxonomy($slug);

        $properties['kizlo'] = self::envelope($single);

        return [
            'type'        => 'object',
            'description' => $single
                ? sprintf('A single "%s" term.', $slug)
                : sprintf('A "%s" term as it appears in a list response, without the resolved SEO block.', $slug),
            'properties'  => $properties + CustomFieldSchema::responseProperties($fields),
        ];
    }

    /**
     * The `kizlo` block the term extension adds. `parent` is here for every
     * taxonomy, hierarchical or not, because it mirrors `WP_Term::$parent`, which
     * is always set.
     *
     * @return array<string, mixed>
     */
    private static function envelope(bool $single): array
    {
        $properties = [];

        if ($single) {
            $properties['seo'] = ['$ref' => CoreSchemas::SEO, 'required' => true];
        }

        return [
            'type'       => 'object',
            'required'   => true,
            'properties' => $properties + [
                'id'          => ['type' => 'integer', 'required' => true],
                'name'        => ['type' => 'string', 'required' => true],
                'slug'        => ['type' => 'string', 'required' => true],
                'description' => ['type' => 'string', 'required' => true],
                'parent'      => ['type' => 'integer', 'required' => true],
                'count'       => ['type' => 'integer', 'required' => true],
                'url'         => ['type' => 'string', 'required' => true, 'format' => 'uri', 'description' => 'The resolved frontend URL.'],
                'extend'      => [
                    'type'                 => 'object',
                    'required'             => true,
                    'additionalProperties' => true,
                    'description'          => 'Whatever the kizlo_extend_term filters contributed.',
                ],
            ],
        ];
    }

    // ============================================================
    // REQUEST SCHEMAS
    // ============================================================

    /**
     * Derived through `get_endpoint_args_for_item_schema()`, which is where
     * `name` being required on create and optional on update comes from.
     *
     * @param array<int, array<string, mixed>> $fields
     * @return array<string, mixed>
     */
    private static function input(string $slug, array $fields, bool $partial): array
    {
        $properties = CoreItemSchema::inputForTaxonomy($slug, $partial);

        return [
            'type'        => 'object',
            'description' => $partial
                ? sprintf('A partial update to a "%s" term. Custom fields are only re-validated when submitted.', $slug)
                : sprintf('A new "%s" term. Required custom fields must be present.', $slug),
            'properties'  => $properties + CustomFieldSchema::inputProperties($fields, $partial),
        ];
    }

    // ============================================================
    // SHARED PIECES
    // ============================================================

    /**
     * Terms cannot be trashed, so a delete always reports what it removed.
     *
     * @return array<string, mixed>
     */
    private static function deleteResponse(string $id): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'deleted'  => ['type' => 'boolean', 'required' => true],
                'previous' => ['$ref' => "{$id}.item", 'required' => true],
            ],
        ];
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
}
