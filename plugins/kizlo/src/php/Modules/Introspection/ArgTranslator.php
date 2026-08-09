<?php

namespace Kizlo\Modules\Introspection;

/**
 * Translates a declared operation input into `register_rest_route()` arguments.
 *
 * This is the one place `$ref` and `$extends` are resolved for real: WordPress
 * needs a flat concrete schema and understands neither keyword. Everything else
 * that reads the contract keeps them.
 *
 * Two things do not survive the crossing:
 *
 * - `nullable: true` becomes a `['string', 'null']` union, which is how
 *   `rest_validate_value_from_schema()` spells nullability.
 * - `file` properties are dropped. Uploads arrive in `$_FILES`, which the REST
 *   schema validator never sees, so those stay manually validated in the handler.
 *
 * Nested `required` needs no translation: `rest_validate_object_value_from_schema()`
 * reads a boolean `required` on each property whenever the object itself has no
 * `required` array, which is exactly how the contract spells it.
 */
class ArgTranslator
{
    /** Keywords WordPress acts on. Anything else is documentation and is dropped. */
    private const RUNTIME_SCHEMA_KEYWORDS = [
        'type',
        'description',
        'required',
        'default',
        'enum',
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
        'properties',
        'items',
        'additionalProperties',
        'patternProperties',
        'anyOf',
        'oneOf',
    ];

    /**
     * @param array<string, mixed>                $input   The declared input, callbacks intact.
     * @param array<string, array<string, mixed>> $schemas Registered schemas, for `$ref` / `$extends`.
     * @return array<string, array<string, mixed>>
     */
    public static function toArgs(array $input, array $schemas): array
    {
        $resolved = (new SchemaResolver($schemas))->resolve($input);

        $properties = $resolved['properties'] ?? null;

        if (!is_array($properties)) {
            return [];
        }

        $args = [];

        foreach ($properties as $name => $property) {
            if (!is_string($name) || !is_array($property)) {
                continue;
            }

            $arg = self::translate($property);

            if ($arg === null) {
                continue;
            }

            foreach (Spec::RUNTIME_KEYWORDS as $keyword) {
                if (isset($property[$keyword])) {
                    $arg[$keyword] = $property[$keyword];
                }
            }

            $args[$name] = self::withCallbacks($arg);
        }

        return $args;
    }

    /**
     * Problems that make the translated arguments *weaker* than what was declared,
     * as opposed to merely undocumented.
     *
     * The distinction matters because the two failures deserve opposite
     * treatments. A documentation-level mistake — a `title` that is not a string,
     * a keyword on the wrong type — is caught by `/introspect`, which fails loudly
     * without taking a working endpoint offline over a typo. But a mistake that
     * silently reduces validation cannot be left running, because the endpoint
     * would then accept input its own declaration says it rejects.
     *
     * Four things land on this side, each because `rest_validate_value_from_schema()`
     * responds to them by validating less rather than by complaining:
     *
     * - An input that is not an object, so there are no arguments to build.
     * - A `$ref` or `$extends` the runtime cannot resolve, so the referenced
     *   constraints are simply absent.
     * - A non-boolean `required`. `rest_validate_object_value_from_schema()`
     *   compares with `true ===`, so a nested `'required' => 'yes'` quietly stops
     *   being required while still reading as required.
     * - A missing or unknown `type`. WordPress warns and then returns valid, so
     *   every constraint on that property stops being enforced.
     *
     * @param array<string, mixed>                $input
     * @param array<string, array<string, mixed>> $schemas
     * @return array<int, string>
     */
    public static function criticalErrors(array $input, array $schemas): array
    {
        $messages = [];

        if (isset($input['type']) && $input['type'] !== 'object') {
            $messages[] = '"input" must be an object schema.';
        }

        if (isset($input['properties']) && !is_array($input['properties'])) {
            $messages[] = '"input.properties" must be a map of property name to schema.';
        }

        $errors = new Diagnostics();
        self::check($input, 'input', new SchemaResolver($schemas), $errors, []);

        foreach ($errors->all() as $error) {
            $messages[] = $error['message'];
        }

        return $messages;
    }

    /**
     * @param array<string, mixed> $schema
     * @param array<int, string>   $stack
     */
    private static function check(array $schema, string $pointer, SchemaResolver $resolver, Diagnostics $errors, array $stack): void
    {
        if (array_key_exists('required', $schema) && !is_bool($schema['required'])) {
            $errors->error([], sprintf('"%s.required" must be a boolean, or WordPress will not enforce it.', $pointer));
        }

        if (isset($schema['$ref'])) {
            $ref = $schema['$ref'];

            if (!is_string($ref) || !$resolver->has($ref)) {
                $errors->error([], sprintf('Unknown schema "%s" at "%s".', is_string($ref) ? $ref : gettype($ref), $pointer));

                return;
            }

            // The target is inlined into the arguments, so its problems become this
            // route's problems. `/introspect` reporting them is not enough on its
            // own: a failing document does not stop the endpoint from serving.
            // Guarded by the stack, since a recursive schema resolves to its bare
            // type rather than looping.
            if (!in_array($ref, $stack, true)) {
                self::check((array) $resolver->get($ref), $ref, $resolver, $errors, array_merge($stack, [$ref]));
            }

            return;
        }

        if (isset($schema['$extends'])) {
            $resolver->mergeExtends($schema, $errors, [], $stack);
        }

        $isUnion = isset($schema['anyOf']) || isset($schema['oneOf']);

        if (!$isUnion && !in_array($schema['type'] ?? null, Spec::TYPES, true)) {
            $errors->error([], sprintf('"%s" declares no usable type, so none of its constraints would be enforced.', $pointer));
        }

        if (isset($schema['pattern']) && is_string($schema['pattern']) && !self::compiles($schema['pattern'])) {
            $errors->error([], sprintf('"%s.pattern" is not a usable regular expression, so it would never be applied.', $pointer));
        }

        foreach ($schema as $keyword => $value) {
            if (!is_array($value)) {
                continue;
            }

            $children = match ($keyword) {
                'properties', 'patternProperties', 'anyOf', 'oneOf' => $value,
                'items', 'additionalProperties'                     => ['' => $value],
                default                                             => [],
            };

            foreach ($children as $name => $child) {
                if (!is_array($child)) {
                    continue;
                }

                $segment = $name === '' ? $keyword : sprintf('%s.%s', $keyword, (string) $name);

                self::check($child, sprintf('%s.%s', $pointer, $segment), $resolver, $errors, $stack);
            }
        }
    }

    /**
     * Attach the callbacks that make WordPress actually run a schema.
     *
     * Left alone, `WP_REST_Request::sanitize_params()` defaults `sanitize_callback`
     * to `rest_parse_request_arg()` — which validates as a side effect — but only
     * when the argument has a `type` and no sanitizer of its own. Both conditions
     * fail silently in ways that matter here:
     *
     * - A union argument has no `type`, so nothing validated it at all.
     * - Declaring a `sanitize_callback` replaced the default, taking the argument's
     *   type and constraints down with it.
     *
     * Setting `validate_callback` explicitly, the way
     * `WP_REST_Controller::get_endpoint_args_for_item_schema()` does, keeps
     * validation independent of sanitization so neither can switch the other off.
     *
     * @param array<string, mixed> $arg
     * @return array<string, mixed>
     */
    private static function withCallbacks(array $arg): array
    {
        $arg['validate_callback'] ??= 'rest_validate_request_arg';

        // A typeless union has nothing for the sanitizer to work from, and
        // rest_validate_request_arg() adopts the matched member's type anyway.
        if (isset($arg['type'])) {
            $arg['sanitize_callback'] ??= 'rest_sanitize_request_arg';
        }

        return $arg;
    }

    /**
     * A pattern that is a valid string but an invalid expression makes
     * `preg_match()` warn and return false, which `rest_validate_json_schema_pattern()`
     * reads as "matched" — so the constraint quietly stops applying. Delimiters
     * mirror how WordPress wraps the pattern before running it.
     */
    private static function compiles(string $pattern): bool
    {
        return @preg_match('#' . str_replace('#', '\\#', $pattern) . '#u', '') !== false;
    }

    /**
     * @param array<string, mixed> $schema
     * @return array<string, mixed>|null Null when the schema describes an upload.
     */
    private static function translate(array $schema): ?array
    {
        if (($schema['type'] ?? null) === 'file') {
            return null;
        }

        $translated = [];

        foreach ($schema as $keyword => $value) {
            if (!in_array($keyword, self::RUNTIME_SCHEMA_KEYWORDS, true)) {
                continue;
            }

            $translated[$keyword] = match (true) {
                $keyword === 'properties' && is_array($value)           => self::translateProperties($value),
                $keyword === 'patternProperties' && is_array($value)    => self::translateProperties($value),
                in_array($keyword, ['items', 'additionalProperties'], true) && is_array($value) => self::translate($value) ?? [],
                in_array($keyword, ['anyOf', 'oneOf'], true) && is_array($value) => self::translateMembers($value),
                default => $value,
            };
        }

        if (!empty($schema['nullable']) && isset($translated['type']) && is_string($translated['type'])) {
            $translated['type'] = [$translated['type'], 'null'];
        }

        return $translated;
    }

    /**
     * @param array<string, mixed> $properties
     * @return array<string, array<string, mixed>>
     */
    private static function translateProperties(array $properties): array
    {
        $translated = [];

        foreach ($properties as $name => $property) {
            if (!is_array($property)) {
                continue;
            }

            $child = self::translate($property);

            if ($child !== null) {
                $translated[$name] = $child;
            }
        }

        return $translated;
    }

    /**
     * @param array<int, mixed> $members
     * @return array<int, array<string, mixed>>
     */
    private static function translateMembers(array $members): array
    {
        $translated = [];

        foreach ($members as $member) {
            if (!is_array($member)) {
                continue;
            }

            $child = self::translate($member);

            if ($child !== null) {
                $translated[] = $child;
            }
        }

        return $translated;
    }
}
