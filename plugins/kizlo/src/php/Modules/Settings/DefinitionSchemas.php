<?php

namespace Kizlo\Modules\Settings;

use Kizlo\Modules\Introspection\CoreSchemas;

/**
 * The operation halves the post type and taxonomy settings routes share.
 *
 * Both kinds are served by {@see \Kizlo\Modules\Registration\DefinitionController},
 * one method per route, so the two sets of routes differ only in which schemas
 * they point at. Writing each contract twice would leave them free to disagree
 * about a surface that is the same code underneath.
 *
 * Inputs derive from the registered response schemas rather than repeating them:
 * a write is the read shape with the read-only properties dropped and nothing
 * required, apart from the path parameter and the two labels a create cannot do
 * without.
 */
final class DefinitionSchemas
{
    /**
     * The definition fields, plus the key that names it. The key is generated
     * once and immutable afterward, so it appears here and nowhere else.
     *
     * @return array<string, mixed>
     */
    public static function createInput(string $definitionId): array
    {
        $properties = SettingsSchemas::optionalProperties($definitionId);

        unset($properties['key']);

        $properties = ['key' => ['type' => 'string', 'required' => true, 'description' => 'Registration key. Lowercase, and immutable once created.']] + $properties;

        // A definition with no labels has nothing to render in the admin, so
        // these two are the only required fields on the payload.
        $properties['singular_label']['required'] = true;
        $properties['plural_label']['required']   = true;

        return ['type' => 'object', 'properties' => $properties];
    }

    /**
     * What supplying `custom_fields` does.
     *
     * Write-only advice, so it is stated here rather than on the shared custom-field schema: a read
     * response has no use for it. That same sharing is why this wording covers every level itself.
     * The nested `fields` arrays come from {@see SettingsSchemas::nestedFields()} inside
     * `kizlo.custom-field`, which both the read responses and this input reference, so there is no
     * separate place to describe them without putting write advice on reads.
     */
    private const CUSTOM_FIELDS_REPLACEMENT = 'When supplied, this array replaces the complete ordered '
        . 'custom-field collection, at every level: a group\'s or repeater\'s `fields` array likewise '
        . 'replaces that container\'s children. Existing fields omitted from the array are removed. '
        . 'Omit `custom_fields` to leave the collection unchanged.';

    /**
     * @param string[] $readOnly
     * @return array<string, mixed>
     */
    public static function updateInput(string $itemId, string $definitionId, array $readOnly): array
    {
        $settings = array_diff_key(SettingsSchemas::optionalProperties($itemId), array_flip($readOnly));

        $definition = SettingsSchemas::optionalProperties($definitionId);
        unset($definition['key']);

        if (isset($settings['custom_fields'])) {
            $settings['custom_fields']['description'] = self::CUSTOM_FIELDS_REPLACEMENT;
        }

        return [
            'type'       => 'object',
            'properties' => self::slugProperty() + $settings + $definition,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function slugInput(): array
    {
        return ['type' => 'object', 'properties' => self::slugProperty()];
    }

    /**
     * @return array<string, mixed>
     */
    public static function deleteInput(): array
    {
        return [
            'type'       => 'object',
            'properties' => self::slugProperty() + [
                'mode' => [
                    'type'        => 'string',
                    'default'     => 'keep_items',
                    'enum'        => ['keep_items', 'delete_items'],
                    'description' => 'Whether to leave the existing entries in place or drain them first.',
                ],
            ],
        ];
    }

    /**
     * Status keys, so the array is keyed by int once PHP has coerced them.
     *
     * @return array<array-key, array<string, mixed>>
     */
    public static function activeResponses(): array
    {
        return [
            '200' => ['description' => 'The definition and its new state.', 'body' => ['$ref' => SettingsSchemas::DEFINITION_ACTIVE]],
            '400' => ['description' => 'No Kizlo-owned definition exists for this slug.', 'body' => ['$ref' => CoreSchemas::ERROR]],
        ];
    }

    /**
     * Status keys, so the array is keyed by int once PHP has coerced them.
     *
     * @return array<array-key, array<string, mixed>>
     */
    public static function deleteResponses(): array
    {
        return [
            '200' => ['description' => 'The definition was removed, or its entries are draining.', 'body' => ['$ref' => SettingsSchemas::DELETE_RESULT]],
            '400' => ['description' => 'No Kizlo-owned definition exists for this slug.', 'body' => ['$ref' => CoreSchemas::ERROR]],
        ];
    }

    /**
     * Status keys, so the array is keyed by int once PHP has coerced them.
     *
     * @return array<array-key, array<string, mixed>>
     */
    public static function progressResponses(): array
    {
        return [
            '200' => ['description' => 'Where the deletion has got to.', 'body' => ['$ref' => SettingsSchemas::DELETE_PROGRESS]],
            '400' => ['description' => 'No deletion is in progress for this slug.', 'body' => ['$ref' => CoreSchemas::ERROR]],
        ];
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private static function slugProperty(): array
    {
        return [
            'slug' => ['type' => 'string', 'required' => true, 'description' => 'Registration key of the definition.'],
        ];
    }
}
