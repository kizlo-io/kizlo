<?php

namespace Kizlo\Modules\Introspection;

/**
 * The derivation {@see CoreCollectionParams} and {@see CoreItemSchema} do, offered
 * to plugins that describe someone else's routes.
 *
 * Those two classes answer one question each about a WordPress core controller,
 * and both were written for routes this plugin describes itself. An extension
 * plugin describing WooCommerce faces the same question about a different object:
 * a `WC_REST_Products_Controller`, or a Store API route whose arguments are a
 * plain array and whose response fields come off a schema class that is not a
 * `WP_REST_Controller` at all.
 *
 * What they have in common is the vocabulary, not the source. Every one of them
 * hands back WordPress-style properties: `type` possibly a list, `context` saying
 * which requests see the field, `readonly` and `arg_options` as bookkeeping, and
 * sanitizers sitting beside all of it. So the bridge takes the properties rather
 * than the object that produced them, and the caller fetches those however its
 * API allows.
 *
 * The alternative was for each plugin to write the schemas out by hand, which is
 * the fork this contract exists to close. A hand-written copy of WooCommerce's
 * cart is wrong the first time WooCommerce ships a field, and wrong silently.
 *
 * ## Callbacks do not survive here
 *
 * {@see CoreSchemaTranslator} keeps `sanitize_callback` and `validate_callback`,
 * because managed routes put them back on the endpoint they registered. Nothing
 * reachable through this bridge registers anything: `kizlo_register_route_spec()`
 * rightly refuses a callback, since a spec has no endpoint to attach one to. So
 * they are stripped on the way out rather than left for the caller to trip over.
 */
final class SpecTranslator
{
    /**
     * Translate a map of WordPress-style properties.
     *
     * @param array<array-key, mixed> $properties Item-schema properties, endpoint args or collection params.
     * @param string                  $subject    Route or schema the properties belong to, for diagnostics.
     * @param string|null             $context    Keep only what this WordPress context returns. Null keeps everything.
     * @param bool                    $required   Mark every surviving property required, nested ones included.
     * @return array<string, array<string, mixed>>
     */
    public static function properties(
        array $properties,
        string $subject = '',
        ?string $context = null,
        bool $required = false,
    ): array {
        if ($context !== null) {
            $properties = self::inContext($properties, $context);
        }

        $translated = CoreSchemaTranslator::properties(
            $properties,
            static function (string $name) use ($subject): void {
                // Reported rather than dropped quietly, for the reason
                // {@see CoreCollectionParams} gives: a field the route returns and
                // the contract never mentions is the defect this derivation exists
                // to end, and it is invisible unless something says so.
                SpecStore::addError(
                    ['path' => $subject, 'keyword' => $name],
                    sprintf(
                        'The "%s" property cannot be expressed as a schema, so "%s" describes it nowhere.',
                        $name,
                        $subject !== '' ? $subject : 'the operation',
                    ),
                );
            },
        );

        $translated = array_map(self::clean(...), $translated);

        return $required ? self::required($translated) : $translated;
    }

    /**
     * Translate one WordPress-style schema, for the places a property map is the
     * wrong shape: a response body that is an array of items, or a nested block
     * fetched on its own.
     *
     * @return array<string, mixed>|null Null when nothing honest can be emitted.
     */
    public static function schema(mixed $schema): ?array
    {
        $translated = CoreSchemaTranslator::schema($schema);

        return $translated === null ? null : self::clean($translated);
    }

    /**
     * Drop what a context does not return, nested properties included: `title`
     * survives a narrowing that `title.raw` does not.
     *
     * A property that declares no context at all is kept. WordPress reads a missing
     * `context` as "every context", and the Store API schemas lean on that.
     *
     * @param array<array-key, mixed> $properties
     * @return array<string, mixed>
     */
    public static function inContext(array $properties, string $context): array
    {
        $kept = [];

        foreach ($properties as $name => $property) {
            if (!is_string($name) || !is_array($property)) {
                continue;
            }

            $declared = $property['context'] ?? null;

            if (is_array($declared) && !in_array($context, $declared, true)) {
                continue;
            }

            if (isset($property['properties']) && is_array($property['properties'])) {
                $property['properties'] = self::inContext($property['properties'], $context);
            }

            if (isset($property['items']['properties']) && is_array($property['items']['properties'])) {
                $property['items']['properties'] = self::inContext($property['items']['properties'], $context);
            }

            $kept[$name] = $property;
        }

        return $kept;
    }

    /**
     * Mark every property required, nested ones included.
     *
     * Worth doing only for a response, and then only when the route populates its
     * schema unconditionally. {@see CoreItemSchema} explains the reasoning: with
     * one context and no `_fields`, there is no field that sometimes appears, so
     * saying so beats hedging every field into optionality a caller must narrow past.
     *
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    public static function required(array $properties): array
    {
        $marked = [];

        foreach ($properties as $name => $property) {
            if (isset($property['properties']) && is_array($property['properties'])) {
                /** @var array<string, array<string, mixed>> $children */
                $children               = $property['properties'];
                $property['properties'] = self::required($children);
            }

            if (isset($property['items']['properties']) && is_array($property['items']['properties'])) {
                /** @var array<string, array<string, mixed>> $children */
                $children                        = $property['items']['properties'];
                $property['items']['properties'] = self::required($children);
            }

            $marked[$name] = $property + ['required' => true];
        }

        return $marked;
    }

    // ============================================================
    // INTERNALS
    // ============================================================

    /**
     * @param array<string, mixed> $schema
     * @return array<string, mixed>
     */
    private static function clean(array $schema): array
    {
        /** @var array<string, mixed> $normalized */
        $normalized = SchemaNormalizer::normalize($schema);

        return $normalized;
    }
}
