<?php

namespace Kizlo\Modules\Registration;

use Kizlo\Modules\Settings\SettingsCache;
use Kizlo\Modules\Settings\SettingsIndexedAbstract;

/**
 * Base for Kizlo-owned object definitions (custom post types and taxonomies).
 *
 * A definition is the stored configuration Kizlo uses to register an object with
 * WordPress. It lives under a single option keyed by object key, alongside the
 * unrelated per-slug settings (SEO, pathname, custom fields). Reuses the indexed
 * load/save pipeline and adds whole-collection access plus deletion.
 */
abstract class RegistrationAbstract extends SettingsIndexedAbstract
{
    /**
     * Every stored definition, keyed by object key.
     *
     * @return array<string, static>
     */
    public static function all(): array
    {
        $items = [];

        foreach (get_option(static::OPTION_KEY, []) as $key => $data) {
            // @phpstan-ignore new.static
            $items[$key] = new static(is_array($data) ? $data : []);
        }

        return $items;
    }

    /**
     * Keys of every stored definition (active and inactive).
     *
     * @return string[]
     */
    public static function keys(): array
    {
        return array_keys(get_option(static::OPTION_KEY, []));
    }

    /**
     * Keys of active definitions only.
     *
     * @return string[]
     */
    public static function activeKeys(): array
    {
        $keys = [];

        foreach (static::all() as $key => $definition) {
            if ($definition->isActive()) {
                $keys[] = $key;
            }
        }

        return $keys;
    }

    public static function exists(string $id): bool
    {
        return array_key_exists($id, get_option(static::OPTION_KEY, []));
    }

    /**
     * Remove a definition. Kizlo settings stored under other options are left
     * untouched so they can be restored if the key is created again.
     */
    public static function delete(string $id): void
    {
        $all = get_option(static::OPTION_KEY, []);

        if (array_key_exists($id, $all)) {
            unset($all[$id]);
            update_option(static::OPTION_KEY, $all);
            SettingsCache::invalidate();
        }
    }

    public function isActive(): bool
    {
        return (bool) $this->get('active');
    }

    public function getKey(): string
    {
        return (string) $this->get('key');
    }

    public function isHierarchical(): bool
    {
        return (bool) $this->get('hierarchical');
    }

    /**
     * WordPress registration arguments derived from this definition.
     *
     * @return array<string, mixed>
     */
    abstract public function toArgs(): array;

    /**
     * The label set WordPress derives from the singular and plural names. Kept in
     * sync with the JS generators in registration/lib.ts so the admin form previews
     * exactly what a blank override registers.
     *
     * @return array<string, string>
     */
    abstract protected function generatedLabels(): array;

    /**
     * Full label set: the generated labels plus any individual overrides. Overrides
     * win; blank override fields fall back to the generated label.
     *
     * @return array<string, string>
     */
    protected function buildLabels(): array
    {
        $overrides = is_array($this->get('labels')) ? $this->get('labels') : [];

        $overrides = array_filter(
            $overrides,
            static fn($value): bool => is_string($value) && $value !== ''
        );

        $labels = array_merge($this->generatedLabels(), $overrides);

        return array_filter($labels, static fn(string $value): bool => $value !== '');
    }

    /**
     * The singular and plural names, trimmed, for label generation.
     *
     * @return array{0: string, 1: string}
     */
    protected function labelNames(): array
    {
        return [
            trim((string) $this->get('singular_label')),
            trim((string) $this->get('plural_label')),
        ];
    }

    /**
     * Rewrite argument shared shape (slug + front prefix). Returns false when
     * rewriting is disabled.
     *
     * @return array<string, mixed>|false
     */
    protected function baseRewriteArg(): array|false
    {
        if (!$this->get('rewrite_enabled')) {
            return false;
        }

        return [
            'slug'       => !empty($this->get('rewrite_slug')) ? (string) $this->get('rewrite_slug') : $this->getKey(),
            'with_front' => (bool) $this->get('rewrite_with_front'),
        ];
    }

    /**
     * Coerce a stored value to a clean list of non-empty strings.
     *
     * @param mixed $value
     * @return string[]
     */
    protected function stringList(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $list = array_map(static fn($item): string => sanitize_key((string) $item), $value);

        return array_values(array_filter($list, static fn($item): bool => $item !== ''));
    }

    /**
     * @param mixed $value
     */
    protected function nullableText(mixed $value): ?string
    {
        return !empty($value) ? sanitize_text_field((string) $value) : null;
    }

    /**
     * Clean a label-override map: keyed by label name, non-empty string values.
     *
     * @param mixed $value
     * @return array<string, string>
     */
    protected function sanitizeLabels(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $labels = [];

        foreach ($value as $label_key => $label_value) {
            if (is_string($label_key) && is_string($label_value) && $label_value !== '') {
                $labels[sanitize_key($label_key)] = sanitize_text_field($label_value);
            }
        }

        return $labels;
    }
}
