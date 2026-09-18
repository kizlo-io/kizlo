<?php

namespace Kizlo\Modules\CustomFields;

use Throwable;
use WP_Error;
use WP_Post;
use WP_Term;
use WP_REST_Request;
use Kizlo\Support\Utils;
use Kizlo\Modules\Introspection\ManagedWrite;

/**
 * Accepts custom-field writes under the Kizlo create/update endpoints'
 * `kizlo.custom` object, the same path the values are read back from.
 *
 * The `/post-types/*` and `/taxonomies/*` routes delegate to the core WordPress
 * REST controllers, so the submitted values are:
 *
 *  1. validated up front on the route's own `validate_callback` — an invalid set
 *     blocks the write with a clean 400 before anything is created (no partial
 *     save), and
 *  2. flattened into `kcf_*` meta in `rest_after_insert_{type}` once the post/term
 *     exists.
 *
 * Which slug a write targets, and whether it is partial, are handed over by the
 * route that was registered for them rather than read back off the request.
 * {@see ManagedWrite}
 *
 * The keys are never registered with `show_in_rest`, so the native `meta` object
 * stays untouched; reads come back through the post/term extension's grouped
 * Kizlo response envelope instead.
 */
class CustomFieldsModule
{
    public function register(): void
    {
        add_filter('kizlo_validate_managed_write', [$this, 'validateWrite'], 10, 3);

        (new CustomFieldsNotice())->register();
        (new PostCustomFieldsMetaBox())->register();
        (new TermCustomFieldsForm())->register();

        foreach (array_keys(Utils::getSettings()->postTypes->all()) as $post_type) {
            add_action("rest_after_insert_{$post_type}", function (WP_Post $post, WP_REST_Request $request) {
                $this->save(CustomFieldsStore::META_POST, $post->ID, $request);
            }, 10, 2);
        }

        foreach (array_keys(Utils::getSettings()->taxonomies->all()) as $taxonomy) {
            add_action("rest_after_insert_{$taxonomy}", function (WP_Term $term, WP_REST_Request $request) {
                $this->save(CustomFieldsStore::META_TERM, $term->term_id, $request);
            }, 10, 2);
        }
    }

    /**
     * Validate submitted custom-field values before the route callback runs, so an
     * invalid set is rejected before the post/term is created.
     *
     * The capability deferral this check needs lives in {@see ManagedWrite}, so
     * it applies to every consumer of the filter rather than to whichever ones
     * remembered it.
     *
     * @param  bool|WP_Error $valid
     * @return bool|WP_Error
     */
    public function validateWrite($valid, ManagedWrite $write, WP_REST_Request $request)
    {
        if (is_wp_error($valid)) {
            return $valid;
        }

        try {
            $values = self::collectValues($request);
            if ($values === null) {
                return $valid;
            }

            $definitions = self::definitions($write);

            CustomFieldsStore::assertWritable(self::writeTargets($definitions, $values, $write->partial), $values);
        } catch (Throwable $e) {
            return new WP_Error('kizlo_custom_fields_invalid', $e->getMessage(), ['status' => 400]);
        }

        return $valid;
    }

    /**
     * Collect submitted custom-field values from the grouped `kizlo.custom`
     * parameter. Returns null when the request carries no group, so a write that
     * never touches custom fields leaves the stored values untouched.
     *
     * An absent group is a no-op at this layer only. A create that has to carry
     * one is rejected before this runs, by the `required` the derived schema puts
     * on `kizlo` and on `custom` inside it.
     *
     * @return array<string, mixed>|null
     * @throws \InvalidArgumentException
     */
    private static function collectValues(WP_REST_Request $request): ?array
    {
        if (!isset($request['kizlo'])) {
            return null;
        }

        $kizlo = $request['kizlo'];
        if (!is_array($kizlo)) {
            throw new \InvalidArgumentException('The kizlo group must be an object.');
        }

        if (!isset($kizlo['custom'])) {
            return null;
        }

        $values = $kizlo['custom'];
        if (!is_array($values)) {
            throw new \InvalidArgumentException('The custom field group must be an object.');
        }

        return $values;
    }

    /**
     * The definitions a write should validate and persist. A create covers every
     * definition, so an omitted required field is rejected. A partial update
     * covers only the fields actually submitted, so a partial edit leaves
     * untouched fields — including required ones — exactly as they were; a
     * required field is only re-checked when it is present in the payload.
     *
     * Which of the two a route is was decided when it was registered, so the
     * HTTP method is not consulted: the taxonomy `replace` operation is a `PUT`
     * and is still partial, because it publishes the partial update input.
     *
     * @param array<int, array<string, mixed>> $definitions
     * @param array<string, mixed>             $values
     * @return array<int, array<string, mixed>>
     */
    private static function writeTargets(array $definitions, array $values, bool $partial): array
    {
        if (!$partial) {
            return $definitions;
        }

        return array_values(array_filter(
            $definitions,
            fn($definition) => array_key_exists((string) $definition['name'], $values)
        ));
    }

    private function save(string $meta_type, int $object_id, WP_REST_Request $request): void
    {
        $write = ManagedWrite::forRequest($request);

        // Also fires for core's own `/wp/v2/*` routes, which never declared the
        // envelope and never reached validateWrite(). {@see ManagedWrite}
        if ($write === null || self::metaType($write) !== $meta_type) {
            return;
        }

        // Content was already validated on the route's validate_callback; a throw
        // here would only mean the two passes disagree, so log rather than 500
        // after the row has been created.
        try {
            $values = self::collectValues($request);
            if ($values === null) {
                return;
            }

            $definitions = self::writeTargets(self::definitions($write), $values, $write->partial);

            CustomFieldsStore::write($meta_type, $object_id, $definitions, $values);
        } catch (Throwable $e) {
            kizlo_log('Custom fields write failed: ' . $e->getMessage());
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function definitions(ManagedWrite $write): array
    {
        $settings = Utils::getSettings();

        return $write->family === ManagedWrite::POST_TYPE
            ? $settings->postTypes->get($write->slug)->getCustomFields()
            : $settings->taxonomies->get($write->slug)->getCustomFields();
    }

    private static function metaType(ManagedWrite $write): string
    {
        return $write->family === ManagedWrite::POST_TYPE
            ? CustomFieldsStore::META_POST
            : CustomFieldsStore::META_TERM;
    }
}
