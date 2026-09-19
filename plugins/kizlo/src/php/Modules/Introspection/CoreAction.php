<?php

namespace Kizlo\Modules\Introspection;

/**
 * A described core operation that is not one of the five.
 *
 * Core does not restrict itself to CRUD. `/users/me` reads the current user off
 * the token rather than an id, `/templates/lookup` resolves a slug through the
 * template hierarchy, `/widget-types/{id}/encode` renders a form submission and
 * `/block-renderer/{name}` renders a block. Each is a real route a caller wants
 * typed, and none of them is expressible as a collection plus an item.
 *
 * So the shape is carried rather than derived. An action states its own route,
 * method, input and responses, and {@see CoreResource} runs it through the same
 * `declaration()` every other operation goes through — which is the point of
 * routing it here instead of letting each family hand-write a spec. The error
 * list, the description note, the stripped runtime callbacks and the `view`
 * context rule all apply identically, so an action cannot quietly acquire a
 * `context` parameter or claim an error code its controller cannot raise.
 */
final class CoreAction
{
    /**
     * `$input` may be a closure, and usually is when it derives from the route
     * table. {@see CoreRouteArgs} can only answer once `rest_api_init` has
     * finished registering every route, while a resource is constructed during
     * it — so evaluating eagerly asks the question before WordPress has an
     * answer and describes the route as missing. Deferring puts the question
     * where every other derivation here already sits: the moment the registered
     * factory is materialized, at document build.
     *
     * @param array<string, array<string, mixed>>|\Closure(): array<string, array<string, mixed>> $input     Declared input properties.
     * @param array<array-key, mixed>                                                            $responses Responses, keyed by status code.
     */
    public function __construct(
        public readonly string $method,
        public readonly string $route,
        public readonly string $summary,
        public readonly array | \Closure $input = [],
        public readonly array $responses = [],
        public readonly ?string $contentType = null,
    ) {
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public function input(): array
    {
        return $this->input instanceof \Closure ? ($this->input)() : $this->input;
    }
}
