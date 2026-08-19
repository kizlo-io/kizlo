<?php

namespace Kizlo\Modules\Introspection;

use WP_REST_Controller;

/**
 * The CRUD contract for a resource Kizlo describes but does not serve.
 *
 * {@see ManagedPostTypes} and {@see ManagedTaxonomies} write their five operations
 * out separately because the two genuinely differ: hierarchy, trashing, custom
 * fields and the resolved SEO block all land in different places. The routes
 * described here differ in almost nothing. They are five WordPress core routes
 * hanging off one controller at one `rest_base`, and the derivation is the same
 * argument every time, so the skeleton is written once and the three resources
 * supply what is actually theirs: the schemas, the error codes, and the handful of
 * parameters core registers outside the item schema.
 *
 * ## The context is `view`, and it is absent rather than pinned
 *
 * {@see CoreItemSchema} explains why one operation must have one response shape,
 * and managed content gets there by pinning `edit` before the controller runs. A
 * described route has nothing to pin it with: no callback, no argument
 * translation, nothing between the caller and WordPress. So the parameter is left
 * out of the declared input instead, and the response is described in the context
 * core falls back to when a request carries none.
 *
 * That is `view`, and it costs nothing here. `edit` on these three resources adds
 * `author_email`, `author_ip`, `author_user_agent` and the `raw` half of every
 * rendered field, none of which Kizlo reads and none of which belong in a public
 * response. Leaving the parameter undeclared is also what makes the description
 * true: a generated client cannot ask for a shape the contract does not describe.
 *
 * It also settles which error codes these routes can carry. Core raises
 * `rest_forbidden_context` from a `'edit' === $request['context']` branch, so a
 * route that declares no `context` cannot reach one, and declaring the code would
 * describe an answer the route has no way to give. The exceptions are the raise
 * sites that never look at `context` at all, which are named where they are kept.
 */
final class CoreResource
{
    /** The context a described core route is read in. @see CoreItemSchema::CONTEXT */
    public const CONTEXT = 'view';

    /**
     * @param string                            $id        API ID the five operations group under.
     * @param string                            $namespace REST namespace the routes live in.
     * @param string                            $base      Collection path, e.g. `/comments`.
     * @param string                            $item      Registered schema ID of a single item.
     * @param string                            $deleted   Registered schema ID of the delete response.
     * @param string                            $noun      Singular noun for the generated summaries.
     * @param string                            $plural    Plural noun for the generated summaries.
     * @param string                            $force     Description of the delete `force` parameter.
     * @param array<string, array<int, string>> $errors    Error codes, keyed by operation name.
     * @param array<string, array<string, mixed>> $extra   Extra input properties, keyed by operation name.
     * @param array<string, string>             $notes     Extra operation descriptions, keyed by operation name.
     */
    public function __construct(
        private readonly string $id,
        private readonly string $namespace,
        private readonly string $base,
        private readonly WP_REST_Controller $controller,
        private readonly string $item,
        private readonly string $deleted,
        private readonly string $noun,
        private readonly string $plural,
        private readonly string $force,
        private readonly array $errors,
        private readonly array $extra = [],
        private readonly array $notes = [],
    ) {
    }

    /**
     * One declaration, derived only when its registered factory is materialized.
     *
     * @return array<string, mixed>
     */
    public function operation(string $operation): array
    {
        return match ($operation) {
            'list'     => $this->list(),
            'retrieve' => $this->retrieve(),
            'create'   => $this->create(),
            'update'   => $this->update(),
            'delete'   => $this->delete(),
            default    => throw new \InvalidArgumentException(sprintf('Unknown resource operation "%s".', $operation)),
        };
    }

    // ============================================================
    // OPERATIONS
    // ============================================================

    /**
     * @return array<string, mixed>
     */
    private function list(): array
    {
        return $this->declaration(
            operation: 'list',
            method: 'GET',
            route: $this->base,
            summary: sprintf('List %s', $this->plural),
            input: [
                'type'       => 'object',
                'properties' => CoreCollectionParams::forController($this->controller, $this->base) + $this->extraFor('list'),
            ],
            responses: [
                '200' => [
                    'description' => sprintf('A page of %s.', $this->plural),
                    'headers'     => ManagedPostTypes::paginationHeaders(),
                    'body'        => ['type' => 'array', 'items' => ['$ref' => $this->item]],
                ],
            ],
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function retrieve(): array
    {
        return $this->declaration(
            operation: 'retrieve',
            method: 'GET',
            route: $this->single(),
            summary: sprintf('Retrieve a single %s', $this->noun),
            input: [
                'type'       => 'object',
                'properties' => ['id' => $this->identifier()] + $this->extraFor('retrieve'),
            ],
            responses: [
                '200' => ['description' => sprintf('The %s.', $this->noun), 'body' => ['$ref' => $this->item]],
                '404' => ['description' => sprintf('No such %s.', $this->noun), 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function create(): array
    {
        return $this->declaration(
            operation: 'create',
            method: 'POST',
            route: $this->base,
            summary: sprintf('Create a %s', $this->noun),
            input: [
                'type'         => 'object',
                'content_type' => Spec::JSON_CONTENT_TYPE,
                'properties'   => CoreItemSchema::inputForController($this->controller, false, $this->base) + $this->extraFor('create'),
            ],
            responses: [
                '201' => ['description' => sprintf('The created %s.', $this->noun), 'body' => ['$ref' => $this->item]],
            ],
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function update(): array
    {
        return $this->declaration(
            operation: 'update',
            method: 'PATCH',
            route: $this->single(),
            summary: sprintf('Update a %s', $this->noun),
            input: [
                'type'         => 'object',
                'content_type' => Spec::JSON_CONTENT_TYPE,
                'properties'   => ['id' => $this->identifier()]
                    + CoreItemSchema::inputForController($this->controller, true, $this->single())
                    + $this->extraFor('update'),
            ],
            responses: [
                '200' => ['description' => sprintf('The updated %s.', $this->noun), 'body' => ['$ref' => $this->item]],
                '404' => ['description' => sprintf('No such %s.', $this->noun), 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function delete(): array
    {
        return $this->declaration(
            operation: 'delete',
            method: 'DELETE',
            route: $this->single(),
            summary: sprintf('Delete a %s', $this->noun),
            input: [
                'type'       => 'object',
                'properties' => [
                    'id'    => $this->identifier(),
                    'force' => ['type' => 'boolean', 'default' => false, 'description' => $this->force],
                ] + $this->extraFor('delete'),
            ],
            responses: [
                '200' => ['description' => 'The deletion result.', 'body' => ['$ref' => $this->deleted]],
                '404' => ['description' => sprintf('No such %s.', $this->noun), 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
        );
    }

    // ============================================================
    // SHARED PIECES
    // ============================================================

    /**
     * @param array<string, mixed>    $input
     * @param array<array-key, mixed> $responses
     * @return array<string, mixed>
     */
    private function declaration(
        string $operation,
        string $method,
        string $route,
        string $summary,
        array $input,
        array $responses,
    ): array {
        $declaration = [
            'id'        => $this->id,
            'operation' => $operation,
            'namespace' => $this->namespace,
            'route'     => $route,
            'method'    => $method,
            'summary'   => $summary,
            'errors'    => $this->errors[$operation] ?? [],
            // The derivation hands back core's own validation and sanitization
            // callbacks, because {@see CoreItemSchema} serves managed routes too
            // and those put them back on the endpoint. A described route registers
            // nothing to put them on, so they are stripped here rather than
            // reaching `kizlo_register_route_spec()`, which rightly refuses them:
            // a callback in a hand-written spec is a mistake worth reporting, and
            // it stays one.
            'input'     => SchemaNormalizer::normalize($input),
            'responses' => $responses,
        ];

        if (isset($this->notes[$operation])) {
            $declaration['description'] = $this->notes[$operation];
        }

        return $declaration;
    }

    /**
     * Core's own regex, so the declaration says what WordPress registered rather
     * than a tidied version of it. {@see PathNormalizer} collapses it to `{id}`.
     */
    private function single(): string
    {
        return sprintf('%s/(?P<id>[\d]+)', $this->base);
    }

    /**
     * @return array<string, mixed>
     */
    private function identifier(): array
    {
        return [
            'type'        => 'integer',
            'required'    => true,
            'description' => sprintf('The %s ID. Core matches digits only, so a slug is not accepted here.', $this->noun),
        ];
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function extraFor(string $operation): array
    {
        return $this->extra[$operation] ?? [];
    }
}
