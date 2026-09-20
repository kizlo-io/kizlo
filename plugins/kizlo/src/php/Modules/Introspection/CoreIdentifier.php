<?php

namespace Kizlo\Modules\Introspection;

/**
 * The segment that selects one record on a described core route.
 *
 * {@see CoreResource} wrote `(?P<id>[\d]+)` into every single-item route, which is
 * true of the three resources it was built for and false of most of the core
 * surface. `/types/(?P<type>[\w-]+)` selects by slug, an application password by
 * uuid, a theme by stylesheet and a block type by a namespaced name. A route that
 * carries the wrong regex describes a route WordPress does not serve, and nothing
 * would catch it: a described route has no handler to fail.
 *
 * Core's own regex is carried rather than a tidied version of it, for the reason
 * {@see PathNormalizer} exists. The contract path is derived from the route, so
 * naming the group is all it takes for `{type}` to reach the generated client,
 * while the declared type stays the only source of truth for what the parameter
 * actually accepts — the regex is never consulted for that.
 */
final class CoreIdentifier
{
    private function __construct(
        private readonly string $name,
        private readonly string $pattern,
        private readonly string $type,
        private readonly string $description,
    ) {
    }

    /**
     * The `wp/v2` default: core matches digits and nothing else, so a slug that
     * would resolve perfectly well through `get_page_by_path()` is a 404 here.
     */
    public static function numeric(string $noun, string $name = 'id'): self
    {
        return new self(
            name: $name,
            pattern: '[\d]+',
            type: 'integer',
            description: sprintf('The %s ID. Core matches digits only, so a slug is not accepted here.', $noun),
        );
    }

    /**
     * A record core addresses by name rather than by row id — a post type, a
     * status, a taxonomy. The pattern is the caller's because core is not
     * consistent about it, and the difference is load-bearing: `[\w-]+` accepts a
     * hyphen where `[\w]+` does not.
     */
    public static function named(string $name, string $noun, string $pattern = '[\w-]+', ?string $description = null): self
    {
        return new self(
            name: $name,
            pattern: $pattern,
            type: 'string',
            description: $description ?? sprintf('The %s identifier.', $noun),
        );
    }

    /** The regex segment appended to the collection base. */
    public function segment(string $base): string
    {
        return sprintf('%s/(?P<%s>%s)', $base, $this->name, $this->pattern);
    }

    public function name(): string
    {
        return $this->name;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public function property(): array
    {
        return [
            $this->name => [
                'type'        => $this->type,
                'required'    => true,
                'description' => $this->description,
            ],
        ];
    }
}
