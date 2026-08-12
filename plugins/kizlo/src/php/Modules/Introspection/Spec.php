<?php

namespace Kizlo\Modules\Introspection;

/**
 * The Kizlo contract vocabulary.
 *
 * Deliberately a subset of JSON Schema rather than an implementation of it: every
 * keyword here either translates losslessly to a WordPress route argument or means
 * something to the TypeScript generator that reads `/introspect`. Anything that
 * satisfies neither (`allOf`, `$defs`, JSON pointers, `not`, conditionals) is
 * absent by design.
 */
final class Spec
{
    public const TYPES = ['string', 'integer', 'number', 'boolean', 'object', 'array', 'file'];

    /**
     * Operation names that map onto CRUD. Any lowercase snake_case name is legal,
     * but generated clients stay predictable when CRUD uses these five.
     */
    public const CANONICAL_OPERATIONS = ['list', 'retrieve', 'create', 'update', 'delete'];

    public const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

    public const JSON_CONTENT_TYPE = 'application/json';

    /** The only request body a `file` property is legal in. */
    public const MULTIPART_CONTENT_TYPE = 'multipart/form-data';

    public const REQUEST_CONTENT_TYPES = [
        self::JSON_CONTENT_TYPE,
        self::MULTIPART_CONTENT_TYPE,
        'application/x-www-form-urlencoded',
    ];

    public const RESPONSE_CONTENT_TYPES = [
        'application/json',
        'text/plain',
        'text/html',
        'application/xml',
        'text/csv',
        'application/octet-stream',
    ];

    /** Non-JSON response bodies must be `string` for these. */
    public const TEXT_CONTENT_TYPES = ['text/plain', 'text/html', 'application/xml', 'text/csv'];

    /** Non-JSON response bodies must be `file` for these. */
    public const BINARY_CONTENT_TYPES = ['application/octet-stream'];

    /**
     * Schema ID prefixes owned by core generation. Registering into them from
     * outside the Kizlo plugin fails introspection.
     */
    public const RESERVED_ID_PREFIXES = ['kizlo.', 'post-types.', 'taxonomies.'];

    /** Keys whose value is a registered schema ID rather than an inline schema. */
    public const REFERENCE_KEYWORDS = ['$ref', '$extends'];

    public const STRUCTURE_KEYWORDS = [
        'type',
        'properties',
        'items',
        '$ref',
        '$extends',
        'additionalProperties',
        'patternProperties',
    ];

    public const PRESENCE_KEYWORDS = ['required', 'nullable', 'default', 'enum'];

    public const UNION_KEYWORDS = ['anyOf', 'oneOf'];

    public const CONSTRAINT_KEYWORDS = [
        'format',
        'minLength',
        'maxLength',
        'pattern',
        'minimum',
        'maximum',
        'exclusiveMinimum',
        'exclusiveMaximum',
        'multipleOf',
        'minItems',
        'maxItems',
        'uniqueItems',
        'minProperties',
        'maxProperties',
        'title',
        'description',
        'deprecated',
    ];

    /**
     * Accepted only inside `kizlo_register_route()` input properties, kept for the
     * WordPress runtime, and stripped before the document is emitted.
     */
    public const RUNTIME_KEYWORDS = ['sanitize_callback', 'validate_callback'];

    /** Keywords legal on a schema of any type. */
    public const UNIVERSAL_KEYWORDS = [
        'type',
        'title',
        'description',
        'deprecated',
        'required',
        'nullable',
        '$ref',
        'anyOf',
        'oneOf',
    ];

    /**
     * Keywords legal only on schemas of a given type. A keyword outside its type's
     * list is a placement error, which catches the common mistakes (`items` on an
     * object, `minLength` on an integer) that would otherwise pass silently
     * through to a generator that ignores them.
     *
     * @var array<string, array<int, string>>
     */
    public const TYPE_KEYWORDS = [
        'string'  => ['default', 'enum', 'format', 'minLength', 'maxLength', 'pattern'],
        'integer' => ['default', 'enum', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'],
        'number'  => ['default', 'enum', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'],
        'boolean' => ['default'],
        'object'  => ['default', 'properties', 'additionalProperties', 'patternProperties', 'minProperties', 'maxProperties', '$extends'],
        'array'   => ['default', 'items', 'minItems', 'maxItems', 'uniqueItems'],
        'file'    => ['format'],
    ];

    /**
     * Every keyword the contract understands, including the runtime-only pair.
     *
     * @return array<int, string>
     */
    public static function allKeywords(): array
    {
        return array_merge(
            self::STRUCTURE_KEYWORDS,
            self::PRESENCE_KEYWORDS,
            self::UNION_KEYWORDS,
            self::CONSTRAINT_KEYWORDS,
            self::RUNTIME_KEYWORDS,
        );
    }

    /**
     * A dot-separated segment. Hyphens and underscores are allowed inside a
     * segment because generated IDs embed post type and taxonomy keys, which
     * WordPress permits both in.
     */
    private const SEGMENT = '[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*';

    /**
     * Schema IDs are global, so they must be vendor- or domain-qualified: at
     * least one dot.
     */
    public static function isValidSchemaId(mixed $id): bool
    {
        return is_string($id) && preg_match('/^' . self::SEGMENT . '(?:\.' . self::SEGMENT . ')+$/', $id) === 1;
    }

    /** API IDs use the same segment rules but may be a single unqualified segment. */
    public static function isValidApiId(mixed $id): bool
    {
        return is_string($id) && preg_match('/^' . self::SEGMENT . '(?:\.' . self::SEGMENT . ')*$/', $id) === 1;
    }

    /** Operation names become generated client method names. */
    public static function isValidOperationName(mixed $name): bool
    {
        return is_string($name) && preg_match('/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/', $name) === 1;
    }

    /** REST namespaces look like `kizlo/v1`, `wc/v3`, `wc/store/v1`. */
    public static function isValidNamespace(mixed $namespace): bool
    {
        return is_string($namespace) && preg_match('/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)+$/', $namespace) === 1;
    }

    public static function isReservedId(string $id): bool
    {
        foreach (self::RESERVED_ID_PREFIXES as $prefix) {
            if (str_starts_with($id, $prefix)) {
                return true;
            }
        }
        return false;
    }

    /** Response keys are `200`-`599` or the literal `default`. */
    public static function isValidStatusKey(mixed $status): bool
    {
        if ($status === 'default') {
            return true;
        }
        $status = (string) $status;
        return preg_match('/^[2-5]\d{2}$/', $status) === 1;
    }

    public static function isSuccessStatus(string $status): bool
    {
        return preg_match('/^2\d{2}$/', $status) === 1;
    }
}
