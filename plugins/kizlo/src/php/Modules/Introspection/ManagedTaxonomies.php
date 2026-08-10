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

        foreach (self::managed() as $slug => $object) {
            $fields = Utils::getSettings()->taxonomies->get($slug)->getCustomFields();
            $id     = self::apiId($slug);

            $schemas["{$id}.list-item"]       = self::item($slug, $object, $fields, false);
            $schemas["{$id}.item"]            = self::item($slug, $object, $fields, true);
            $schemas["{$id}.create-input"]    = self::input($slug, $object, $fields, false);
            $schemas["{$id}.update-input"]    = self::input($slug, $object, $fields, true);
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

        return [
            'list' => [
                'id'        => $id,
                'operation' => 'list',
                'namespace' => KIZLO_API_NAMESPACE,
                'route'     => $collection,
                'methods'   => ['GET'],
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
                'methods'   => ['GET'],
                'summary'   => sprintf('Retrieve a single %s term', $slug),
                'input'     => [
                    'type'       => 'object',
                    'properties' => [
                        'identifier' => self::identifier(),
                        'context'    => self::context(),
                    ],
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
                'methods'   => ['POST'],
                'summary'   => sprintf('Create a %s term', $slug),
                'input'     => ['$extends' => "{$id}.create-input", 'type' => 'object', 'content_type' => Spec::JSON_CONTENT_TYPE],
                'responses' => [
                    '201' => ['description' => 'The created term.', 'body' => ['$ref' => "{$id}.item"]],
                    '400' => ['description' => 'Invalid request.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                    '404' => ['description' => 'Taxonomy not found.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                ],
            ],

            'update' => [
                'id'        => $id,
                'operation' => 'update',
                'namespace' => KIZLO_API_NAMESPACE,
                'route'     => $single,
                'methods'   => ['PUT', 'PATCH'],
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
            ],

            'delete' => [
                'id'        => $id,
                'operation' => 'delete',
                'namespace' => KIZLO_API_NAMESPACE,
                'route'     => $single,
                'methods'   => ['DELETE'],
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
     * @param array<int, array<string, mixed>> $fields
     * @return array<string, mixed>
     */
    private static function item(string $slug, WP_Taxonomy $object, array $fields, bool $single): array
    {
        $properties = [];

        if ($object->hierarchical) {
            $properties['parent'] = ['type' => 'integer', 'required' => true];
        }

        $properties['kizlo'] = self::envelope($single);

        return [
            '$extends'    => CoreSchemas::TERM,
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
     * @param array<int, array<string, mixed>> $fields
     * @return array<string, mixed>
     */
    private static function input(string $slug, WP_Taxonomy $object, array $fields, bool $partial): array
    {
        $properties = [
            'name'        => $partial ? ['type' => 'string'] : ['type' => 'string', 'required' => true],
            'description' => ['type' => 'string'],
            'slug'        => ['type' => 'string'],
            'meta'        => ['type' => 'object', 'additionalProperties' => true],
        ];

        if ($object->hierarchical) {
            $properties['parent'] = ['type' => 'integer'];
        }

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

    /**
     * @return array<string, mixed>
     */
    private static function context(): array
    {
        return ['type' => 'string', 'enum' => ['view', 'embed', 'edit'], 'default' => 'view'];
    }
}
