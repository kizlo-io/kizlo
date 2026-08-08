<?php

namespace Kizlo\Modules\Registration;

use InvalidArgumentException;

/**
 * Validates object keys before a Kizlo-owned definition is created.
 *
 * WordPress exposes no single API for its reserved keys, so the documented
 * reserved post types and taxonomies are listed here. Keys are immutable once
 * created; the update path never revalidates or changes a key.
 */
class RegistrationValidator
{
    /**
     * Post type keys WordPress reserves for itself.
     *
     * @var string[]
     */
    public const RESERVED_POST_TYPES = [
        'post',
        'page',
        'attachment',
        'revision',
        'nav_menu_item',
        'custom_css',
        'customize_changeset',
        'oembed_cache',
        'user_request',
        'wp_block',
        'wp_template',
        'wp_template_part',
        'wp_global_styles',
        'wp_navigation',
        'action',
        'author',
        'order',
        'theme',
    ];

    /**
     * Taxonomy keys WordPress reserves for itself.
     *
     * @var string[]
     */
    public const RESERVED_TAXONOMIES = [
        'category',
        'post_tag',
        'nav_menu',
        'link_category',
        'post_format',
        'author',
        'type',
    ];

    /**
     * @throws InvalidArgumentException When the key is invalid, reserved, or taken.
     */
    public static function assertPostTypeKey(string $key): void
    {
        self::assertShape($key, PostTypeRegistration::KEY_MAX_LENGTH, 'post type');

        if (in_array($key, self::RESERVED_POST_TYPES, true) || str_starts_with($key, 'wp_')) {
            throw new InvalidArgumentException("\"{$key}\" is a reserved post type key.");
        }

        if (post_type_exists($key) || PostTypeRegistration::exists($key)) {
            throw new InvalidArgumentException("A post type with the key \"{$key}\" already exists.");
        }
    }

    /**
     * @throws InvalidArgumentException When the key is invalid, reserved, or taken.
     */
    public static function assertTaxonomyKey(string $key): void
    {
        self::assertShape($key, TaxonomyRegistration::KEY_MAX_LENGTH, 'taxonomy');

        if (in_array($key, self::RESERVED_TAXONOMIES, true)) {
            throw new InvalidArgumentException("\"{$key}\" is a reserved taxonomy key.");
        }

        if (taxonomy_exists($key) || TaxonomyRegistration::exists($key)) {
            throw new InvalidArgumentException("A taxonomy with the key \"{$key}\" already exists.");
        }
    }

    /**
     * @throws InvalidArgumentException
     */
    private static function assertShape(string $key, int $max_length, string $label): void
    {
        if ($key === '') {
            throw new InvalidArgumentException("A {$label} key is required.");
        }

        if (!preg_match('/^[a-z][a-z0-9_-]*$/', $key)) {
            throw new InvalidArgumentException(
                "A {$label} key may only contain lowercase letters, numbers, hyphens, and underscores, and must start with a letter."
            );
        }

        if (strlen($key) > $max_length) {
            throw new InvalidArgumentException("A {$label} key may not exceed {$max_length} characters.");
        }
    }
}
