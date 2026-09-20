<?php

namespace Kizlo\Modules\Introspection;

use WP_REST_Controller;

/**
 * The contract for a resource Kizlo describes but does not serve.
 *
 * {@see ManagedPostTypes} and {@see ManagedTaxonomies} write their five operations
 * out separately because the two genuinely differ: hierarchy, trashing, custom
 * fields and the resolved SEO block all land in different places. The routes
 * described here differ in almost nothing. They hang off one controller at one
 * `rest_base`, and the derivation is the same argument every time, so the skeleton
 * is written once and each resource supplies what is actually its own: the
 * schemas, the error codes, and the handful of parameters core registers outside
 * the item schema.
 *
 * ## Five operations was the shape of three resources, not of core
 *
 * This class was built for comments, menus and menu items, which are five
 * operations behind a numeric id, and it hardcoded exactly that. Most of the core
 * surface is not. `/search` lists and nothing else; `/settings` is a singleton
 * core updates with `POST`; `/types/(?P<type>[\w-]+)` selects by slug; revisions
 * hang off a parent; application passwords register a delete on the collection as
 * well as the item; `/users/me` is not CRUD at all. So the operation set, the
 * identifier ({@see CoreIdentifier}), the parent scope and the non-CRUD actions
 * ({@see CoreAction}) are all declared by the resource, and the default remains
 * what the original three need.
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
 * That is `view`, and it costs little here. `edit` adds `author_email`,
 * `author_ip`, `author_user_agent` and the `raw` half of every rendered field,
 * none of which Kizlo reads and none of which belong in a public response. Leaving
 * the parameter undeclared is also what makes the description true: a generated
 * client cannot ask for a shape the contract does not describe.
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

    /** What a resource offers unless it says otherwise. */
    public const CRUD = ['list', 'retrieve', 'create', 'update', 'delete'];

    /**
     * @param string                              $id         API ID the operations group under.
     * @param string                              $namespace  REST namespace the routes live in.
     * @param string                              $base       Collection path, e.g. `/comments`. Carries the parent groups when the resource is parent-scoped.
     * @param string                              $item       Registered schema ID of a single item.
     * @param array<int, string>                  $operations Operation names this resource offers.
     * @param CoreIdentifier|null                 $identifier Segment selecting one record; null for a singleton.
     * @param array<int, CoreIdentifier>          $parents    Identifiers `$base` already carries, declared so every operation accepts them.
     * @param string|null                         $deleted    Registered schema ID of the delete response.
     * @param string|null                         $deletedAll Registered schema ID of the collection-delete response, when it differs.
     * @param string|null                         $force      Description of the delete `force` parameter, or null when core registers none.
     * @param array<string, array<int, string>>   $errors     Error codes, keyed by operation name.
     * @param array<string, array<string, mixed>> $extra      Extra input properties, keyed by operation name.
     * @param array<string, string>               $notes      Extra operation descriptions, keyed by operation name.
     * @param array<string, CoreAction>           $actions    Non-CRUD operations, keyed by operation name.
     */
    public function __construct(
        private readonly string $id,
        private readonly string $namespace,
        private readonly string $base,
        private readonly WP_REST_Controller $controller,
        private readonly string $item,
        private readonly string $noun,
        private readonly string $plural,
        private readonly array $operations = self::CRUD,
        private readonly ?CoreIdentifier $identifier = null,
        private readonly array $parents = [],
        private readonly ?string $deleted = null,
        private readonly ?string $deletedAll = null,
        private readonly ?string $force = null,
        private readonly array $errors = [],
        private readonly array $extra = [],
        private readonly array $notes = [],
        private readonly array $actions = [],
        private readonly string $createContentType = Spec::JSON_CONTENT_TYPE,
    ) {
    }

    /**
     * @return array<int, string>
     */
    public function operations(): array
    {
        return $this->operations;
    }

    /**
     * One declaration, derived only when its registered factory is materialized.
     *
     * @return array<string, mixed>
     */
    public function operation(string $operation): array
    {
        if (isset($this->actions[$operation])) {
            return $this->action($operation, $this->actions[$operation]);
        }

        return match ($operation) {
            'list'      => $this->list(),
            'retrieve'  => $this->retrieve(),
            'create'    => $this->create(),
            'update'    => $this->update(),
            'delete'    => $this->delete(),
            'delete_all' => $this->deleteAll(),
            default     => throw new \InvalidArgumentException(sprintf('Unknown resource operation "%s".', $operation)),
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
                'properties' => $this->parentProperties()
                    + CoreCollectionParams::forController($this->controller, $this->base)
                    + $this->extraFor('list'),
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
                'properties' => $this->selector() + $this->extraFor('retrieve'),
            ],
            responses: $this->found(sprintf('The %s.', $this->noun)),
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
                'content_type' => $this->createContentType,
                'properties'   => $this->parentProperties()
                    + CoreItemSchema::inputForController($this->controller, false, $this->base)
                    + $this->extraFor('create'),
            ],
            responses: [
                '201' => ['description' => sprintf('The created %s.', $this->noun), 'body' => ['$ref' => $this->item]],
            ],
        );
    }

    /**
     * A singleton has nothing to address, so core registers the write on the
     * collection itself — and registers it `POST`, not `PATCH`, which is what
     * `WP_REST_Settings_Controller` serves.
     *
     * @return array<string, mixed>
     */
    private function update(): array
    {
        $route = $this->single();

        return $this->declaration(
            operation: 'update',
            method: $this->identifier === null ? 'POST' : 'PATCH',
            route: $route,
            summary: sprintf('Update a %s', $this->noun),
            input: [
                'type'         => 'object',
                'content_type' => Spec::JSON_CONTENT_TYPE,
                'properties'   => $this->selector()
                    + CoreItemSchema::inputForController($this->controller, true, $route)
                    + $this->extraFor('update'),
            ],
            responses: $this->found(sprintf('The updated %s.', $this->noun)),
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
                'properties' => $this->selector() + $this->forceProperty() + $this->extraFor('delete'),
            ],
            responses: $this->deletionResult(),
        );
    }

    /**
     * Core registers a delete on the collection as well as the item for
     * application passwords, where revoking every password at once is a real
     * operation rather than a convenience.
     *
     * @return array<string, mixed>
     */
    private function deleteAll(): array
    {
        return $this->declaration(
            operation: 'delete_all',
            method: 'DELETE',
            route: $this->base,
            summary: sprintf('Delete all %s', $this->plural),
            input: [
                'type'       => 'object',
                'properties' => $this->parentProperties() + $this->extraFor('delete_all'),
            ],
            // Core answers a collection delete with a count rather than the
            // record it removed, because there is no single record to return.
            responses: [
                '200' => [
                    'description' => sprintf('How many %s were deleted.', $this->plural),
                    'body'        => ['$ref' => $this->deletedAll ?? $this->deleted ?? $this->item],
                ],
            ],
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function action(string $operation, CoreAction $action): array
    {
        $input = [
            'type'       => 'object',
            'properties' => $this->parentProperties() + $action->input(),
        ];

        if ($action->contentType !== null) {
            $input['content_type'] = $action->contentType;
        }

        return $this->declaration(
            operation: $operation,
            method: $action->method,
            route: $action->route,
            summary: $action->summary,
            input: $input,
            responses: $action->responses,
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
     * A singleton has no such segment and is addressed at the collection.
     */
    private function single(): string
    {
        return $this->identifier === null ? $this->base : $this->identifier->segment($this->base);
    }

    /**
     * Everything it takes to address one record: the parents the base carries,
     * then the identifier itself.
     *
     * @return array<string, array<string, mixed>>
     */
    private function selector(): array
    {
        return $this->parentProperties() + ($this->identifier?->property() ?? []);
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function parentProperties(): array
    {
        $properties = [];

        foreach ($this->parents as $parent) {
            $properties += $parent->property();
        }

        return $properties;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function forceProperty(): array
    {
        if ($this->force === null) {
            return [];
        }

        return ['force' => ['type' => 'boolean', 'default' => false, 'description' => $this->force]];
    }

    /**
     * A singleton cannot 404: core serves it whether or not anything has been
     * written, so describing the branch would publish an answer the route has no
     * way to give.
     *
     * @return array<array-key, mixed>
     */
    private function found(string $description): array
    {
        $responses = ['200' => ['description' => $description, 'body' => ['$ref' => $this->item]]];

        if ($this->identifier !== null) {
            $responses['404'] = [
                'description' => sprintf('No such %s.', $this->noun),
                'body'        => ['$ref' => CoreSchemas::ERROR],
            ];
        }

        return $responses;
    }

    /**
     * @return array<array-key, mixed>
     */
    private function deletionResult(): array
    {
        $responses = [
            '200' => [
                'description' => 'The deletion result.',
                'body'        => ['$ref' => $this->deleted ?? $this->item],
            ],
        ];

        if ($this->identifier !== null) {
            $responses['404'] = [
                'description' => sprintf('No such %s.', $this->noun),
                'body'        => ['$ref' => CoreSchemas::ERROR],
            ];
        }

        return $responses;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function extraFor(string $operation): array
    {
        return $this->extra[$operation] ?? [];
    }
}
