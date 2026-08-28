<?php

namespace Kizlo\Modules\CustomFields;

use Throwable;
use WP_Error;
use WP_Post;
use WP_Term;
use WP_REST_Request;
use Kizlo\Support\Utils;

/**
 * Accepts custom-field writes under the Kizlo create/update endpoints' `custom`
 * object, matching the public response shape.
 *
 * The `/post-types/*` and `/taxonomies/*` routes delegate to the core WordPress
 * REST controllers, so the submitted values are:
 *
 *  1. validated up front in `rest_request_before_callbacks` — an invalid set blocks
 *     the write with a clean 400 before anything is created (no partial save), and
 *  2. flattened into `kcf_*` meta in `rest_after_insert_{type}` once the post/term
 *     exists.
 *
 * The keys are never registered with `show_in_rest`, so the native `meta` object
 * stays untouched; reads come back through the post/term extension's grouped
 * Kizlo response envelope instead.
 */
class CustomFieldsModule
{
    public function register(): void
    {
        add_filter('rest_request_before_callbacks', [$this, 'validateRequest'], 10, 3);

        (new CustomFieldsNotice())->register();
        (new PostCustomFieldsMetaBox())->register();
        (new TermCustomFieldsForm())->register();

        foreach (array_keys(Utils::getSettings()->postTypes->all()) as $post_type) {
            add_action("rest_after_insert_{$post_type}", function (WP_Post $post, WP_REST_Request $request) {
                $this->save(CustomFieldsStore::META_POST, $post->ID, self::postTypeFields($post->post_type), $request);
            }, 10, 2);
        }

        foreach (array_keys(Utils::getSettings()->taxonomies->all()) as $taxonomy) {
            add_action("rest_after_insert_{$taxonomy}", function (WP_Term $term, WP_REST_Request $request) {
                $this->save(CustomFieldsStore::META_TERM, $term->term_id, self::taxonomyFields($term->taxonomy), $request);
            }, 10, 2);
        }
    }

    /**
     * Validate submitted custom-field values before the route callback runs, so an
     * invalid set is rejected before the post/term is created.
     *
     * @param mixed $response Current short-circuit response (null to continue).
     * @return mixed
     */
    public function validateRequest($response, $handler, WP_REST_Request $request)
    {
        if (is_wp_error($response)) {
            return $response;
        }

        if (!in_array($request->get_method(), ['POST', 'PUT', 'PATCH'], true)) {
            return $response;
        }

        $definitions = $this->definitionsForRequest($request);
        if ($definitions === null) {
            return $response;
        }

        try {
            $values = self::collectValues($request);
            if ($values === null) {
                return $response;
            }

            CustomFieldsStore::assertWritable(self::writeTargets($definitions, $values, $request), $values);
        } catch (Throwable $e) {
            return new WP_Error('kizlo_custom_fields_invalid', $e->getMessage(), ['status' => 400]);
        }

        return $response;
    }

    /**
     * Resolve the definitions targeted by a Kizlo write route, or null when the
     * request is not a managed post-type / taxonomy write.
     *
     * @return array<int, array<string, mixed>>|null
     */
    private function definitionsForRequest(WP_REST_Request $request): ?array
    {
        $post_type = $request->get_param('post_type');
        if (is_string($post_type) && post_type_exists($post_type)) {
            return self::postTypeFields($post_type);
        }

        $taxonomy = $request->get_param('taxonomy');
        if (is_string($taxonomy) && taxonomy_exists($taxonomy)) {
            return self::taxonomyFields($taxonomy);
        }

        return null;
    }

    /**
     * Collect submitted custom-field values from the grouped `custom` parameter.
     * Returns null when the request carries no group, so a write that never
     * touches custom fields leaves the stored values untouched.
     *
     * @return array<string, mixed>|null
     * @throws \InvalidArgumentException
     */
    private static function collectValues(WP_REST_Request $request): ?array
    {
        if (!isset($request['custom'])) {
            return null;
        }

        $values = $request['custom'];
        if (!is_array($values)) {
            throw new \InvalidArgumentException('The custom field group must be an object.');
        }

        return $values;
    }

    /**
     * The definitions a write should validate and persist. A create (POST) covers
     * every definition, so an omitted required field is rejected. An update
     * (PUT/PATCH) covers only the fields actually submitted, so a partial edit
     * leaves untouched fields — including required ones — exactly as they were; a
     * required field is only re-checked when it is present in the payload.
     *
     * @param array<int, array<string, mixed>> $definitions
     * @param array<string, mixed>             $values
     * @return array<int, array<string, mixed>>
     */
    private static function writeTargets(array $definitions, array $values, WP_REST_Request $request): array
    {
        if (!in_array($request->get_method(), ['PUT', 'PATCH'], true)) {
            return $definitions;
        }

        return array_values(array_filter(
            $definitions,
            fn($definition) => array_key_exists((string) $definition['name'], $values)
        ));
    }

    /**
     * @param array<int, array<string, mixed>> $definitions
     */
    private function save(string $meta_type, int $object_id, array $definitions, WP_REST_Request $request): void
    {
        // Content was already validated in rest_request_before_callbacks; a throw
        // here would only mean the two passes disagree, so log rather than 500
        // after the row has been created.
        try {
            $values = self::collectValues($request);
            if ($values === null) {
                return;
            }

            CustomFieldsStore::write($meta_type, $object_id, self::writeTargets($definitions, $values, $request), $values);
        } catch (Throwable $e) {
            kizlo_log('Custom fields write failed: ' . $e->getMessage());
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function postTypeFields(string $post_type): array
    {
        return Utils::getSettings()->postTypes->get($post_type)->getCustomFields();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function taxonomyFields(string $taxonomy): array
    {
        return Utils::getSettings()->taxonomies->get($taxonomy)->getCustomFields();
    }
}
