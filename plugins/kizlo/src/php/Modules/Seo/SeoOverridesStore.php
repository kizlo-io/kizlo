<?php

namespace Kizlo\Modules\Seo;

use InvalidArgumentException;

/**
 * Reads and writes the per-item SEO overrides {@see SeoBase::OVERRIDE_KEYS} names.
 *
 * Both authoring paths come through here — the wp-admin meta boxes and the REST
 * write surface — so the two cannot drift. The keys stay unregistered and
 * underscore-prefixed either way: WordPress's native `meta` object never carries
 * them, and the contract exposes the grouped `kizlo.seo` input instead of the
 * internal key names.
 *
 * Values are held in the flat shape `OVERRIDE_KEYS` is keyed by (`og_title`,
 * `twitter_image_id`), which is what the editor already posts. The REST payload
 * arrives grouped (`og.title`) and {@see self::fromInput()} flattens it.
 *
 * Writes are per-field: a key present in the map is written, an empty value
 * deletes its key so the item falls back to its template, and a key absent from
 * the map is left exactly as it was. That is what makes a PATCH partial while the
 * editor, which submits every field, still clears what the user emptied.
 */
class SeoOverridesStore
{
    public const META_POST = 'post';
    public const META_TERM = 'term';

    /**
     * The schema.org type fields only a post carries. A term always resolves to a
     * CollectionPage, so {@see TermSeoMetaBox} has never offered them either.
     */
    public const POST_ONLY_FIELDS = ['webpage_type', 'article_type'];

    /** The grouped input keys, mapped to their flat field prefix. */
    private const SOCIAL_GROUPS = ['og' => 'og', 'twitter' => 'twitter'];

    /** The grouped input keys inside a social group, mapped to their flat suffix. */
    private const SOCIAL_FIELDS = ['title' => 'title', 'description' => 'description', 'image_id' => 'image_id'];

    /**
     * The fields this object type supports.
     *
     * @return array<int, string>
     */
    public static function fields(string $meta_type): array
    {
        $fields = array_keys(SeoBase::OVERRIDE_KEYS);

        return $meta_type === self::META_TERM
            ? array_values(array_diff($fields, self::POST_ONLY_FIELDS))
            : $fields;
    }

    /**
     * The stored overrides as a flat field map, every supported field present.
     *
     * @return array<string, string>
     */
    public static function read(string $meta_type, int $object_id): array
    {
        $values = [];

        foreach (self::fields($meta_type) as $field) {
            $values[$field] = (string) self::readMeta($meta_type, $object_id, SeoBase::OVERRIDE_KEYS[$field]);
        }

        return $values;
    }

    /**
     * Persist a sanitized flat field map.
     *
     * Writes what it is given. {@see self::assertWritable()} is the REST path's
     * gate and runs before the row exists, rather than here, so the editor keeps
     * coercing an image ID its media picker could not have got wrong instead of
     * abandoning an otherwise good save over one field.
     *
     * @param array<string, mixed> $values
     */
    public static function write(string $meta_type, int $object_id, array $values): void
    {
        foreach ($values as $field => $value) {
            $meta_key = SeoBase::OVERRIDE_KEYS[$field];

            if (self::clears($value)) {
                self::deleteMeta($meta_type, $object_id, $meta_key);
            } else {
                self::updateMeta($meta_type, $object_id, $meta_key, $value);
            }
        }
    }

    /**
     * Sanitize a complete editor submission. Every supported field is present in
     * the result, defaulting to empty, so a field the user cleared is removed.
     *
     * @param array<string, mixed> $raw Flat, as the editor posts it.
     * @return array<string, mixed>
     */
    public static function fromEditor(string $meta_type, array $raw): array
    {
        $values = [];

        foreach (self::fields($meta_type) as $field) {
            $values[$field] = self::sanitize($field, $raw[$field] ?? '');
        }

        return $values;
    }

    /**
     * Flatten and sanitize a grouped REST payload, carrying only the fields it
     * actually submitted so an update leaves the rest alone.
     *
     * @param array<string, mixed> $input Grouped, as `kizlo.seo` declares it.
     * @return array<string, mixed>
     * @throws InvalidArgumentException
     */
    public static function fromInput(string $meta_type, array $input): array
    {
        $supported = self::fields($meta_type);
        $values    = [];

        foreach ($input as $key => $value) {
            if (isset(self::SOCIAL_GROUPS[$key])) {
                if (!is_array($value)) {
                    throw new InvalidArgumentException("The SEO \"{$key}\" group must be an object.");
                }

                foreach ($value as $child => $child_value) {
                    if (!isset(self::SOCIAL_FIELDS[$child])) {
                        continue;
                    }

                    $field = self::SOCIAL_GROUPS[$key] . '_' . self::SOCIAL_FIELDS[$child];

                    if (in_array($field, $supported, true)) {
                        $values[$field] = self::sanitize($field, $child_value);
                    }
                }

                continue;
            }

            if (in_array((string) $key, $supported, true)) {
                $values[(string) $key] = self::sanitize((string) $key, $value);
            }
        }

        return $values;
    }

    /**
     * The two image fields are the only ones a caller can get wrong in a way that
     * survives sanitizing: `absint` turns any number into a plausible attachment
     * ID. The editor's media picker cannot produce a broken one, which is why it
     * only coerces; an API caller trivially can, so the REST path checks before
     * the row is created.
     *
     * @param array<string, mixed> $values Flat, sanitized.
     * @throws InvalidArgumentException
     */
    public static function assertWritable(array $values): void
    {
        foreach (['og_image_id', 'twitter_image_id'] as $field) {
            $id = (int) ($values[$field] ?? 0);

            if ($id === 0) {
                continue;
            }

            if (get_post_type($id) !== 'attachment' || !str_starts_with((string) get_post_mime_type($id), 'image/')) {
                throw new InvalidArgumentException("SEO field \"{$field}\" must reference an uploaded image.");
            }
        }
    }

    /**
     * Whether a sanitized value clears its override.
     *
     * Deliberately not `empty()`: that treats the string "0" as absent, so a title
     * of "0" would answer 200 and delete the override instead of storing it. The
     * schema promises only that an *empty* value clears.
     */
    private static function clears(mixed $value): bool
    {
        return $value === '' || $value === 0;
    }

    /**
     * The sanitizers {@see SeoMetaBox::save()} has always applied, in one place so
     * the REST path stores byte-identical values.
     *
     * The text values are passed through uncast. `_sanitize_text_fields()` returns
     * '' for an array or object, and a `(string)` cast here would defeat that
     * guard: an array would arrive as the literal "Array" and be stored as the
     * title, having first raised a conversion warning.
     */
    private static function sanitize(string $field, mixed $value): mixed
    {
        return match ($field) {
            'description', 'og_description', 'twitter_description' => sanitize_textarea_field($value),
            'canonical'                                            => is_string($value) ? esc_url_raw($value) : '',
            'og_image_id', 'twitter_image_id'                      => is_scalar($value) ? absint($value) : 0,
            'noindex', 'nofollow'                                  => !empty($value) ? '1' : '',
            default                                                => sanitize_text_field($value),
        };
    }

    private static function readMeta(string $meta_type, int $object_id, string $key): mixed
    {
        return $meta_type === self::META_TERM
            ? get_term_meta($object_id, $key, true)
            : get_post_meta($object_id, $key, true);
    }

    private static function updateMeta(string $meta_type, int $object_id, string $key, mixed $value): void
    {
        if ($meta_type === self::META_TERM) {
            update_term_meta($object_id, $key, $value);
        } else {
            update_post_meta($object_id, $key, $value);
        }
    }

    private static function deleteMeta(string $meta_type, int $object_id, string $key): void
    {
        if ($meta_type === self::META_TERM) {
            delete_term_meta($object_id, $key);
        } else {
            delete_post_meta($object_id, $key);
        }
    }
}
