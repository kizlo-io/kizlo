<?php

namespace Kizlo\Modules\Introspection;

use WP_REST_Controller;
use WP_REST_Posts_Controller;
use WP_REST_Terms_Controller;

/**
 * The controller behind a managed route.
 *
 * There is one of these because three places need the same answer and a
 * disagreement between them is invisible. {@see \Kizlo\Modules\PostType\PostTypeApi}
 * calls the controller, {@see CoreItemSchema} reads the response and the write
 * surface off it, and {@see CoreCollectionParams} reads the list off it. Derive
 * from one controller and serve through another and the contract describes an API
 * nobody is running, which is the failure the derivation exists to rule out.
 *
 * Which class that is comes from WordPress rather than from a list here.
 * `register_post_type()` takes a `rest_controller_class`, and core passes
 * `WP_REST_Attachments_Controller` for `attachment` — the controller that reads
 * `$_FILES`, calls `wp_handle_upload()` and generates the thumbnails. Kizlo served
 * every type through `WP_REST_Posts_Controller`, so an attachment created through
 * a managed route was a post row with no file behind it. Reading the registration
 * ends that without naming `attachment` anywhere, and a post type another plugin
 * registers with a controller of its own is served through that one for the same
 * reason.
 *
 * Built fresh on every call, deliberately. `WP_Post_Type::get_rest_controller()`
 * hands back a memoized instance and `get_item_schema()` caches on the instance,
 * so a field or status registered after the first call would never reach a later
 * build — and {@see ManagedContent::flush()} exists to make a rebuild mean
 * something. Construction is a few property assignments; the schema work behind it
 * is what {@see CoreItemSchema} memoizes.
 */
final class CoreControllers
{
    public static function forPostType(string $slug): WP_REST_Posts_Controller
    {
        $object = get_post_type_object($slug);
        $class  = self::declaredClass(is_object($object) ? $object->rest_controller_class : null, WP_REST_Posts_Controller::class);

        /** @var WP_REST_Posts_Controller */
        return new $class($slug);
    }

    public static function forTaxonomy(string $slug): WP_REST_Terms_Controller
    {
        $object = get_taxonomy($slug);
        $class  = self::declaredClass(is_object($object) ? $object->rest_controller_class : null, WP_REST_Terms_Controller::class);

        /** @var WP_REST_Terms_Controller */
        return new $class($slug);
    }

    /**
     * The controller instance already serving a route.
     *
     * Most described resources name their controller, because constructing one
     * is a slug away. A few cannot: `WP_REST_Search_Controller` takes the list of
     * search handlers as a constructor argument, and that list is assembled in
     * `create_initial_rest_routes()` and then filtered through
     * `wp_rest_search_handlers`. Rebuilding it here would be a second copy of
     * core's assembly, free to drift from the one actually answering requests.
     *
     * So the object is taken from the registration instead. It is the controller
     * serving the route by definition, which is the property every derivation
     * here depends on and the only one that cannot be wrong.
     */
    public static function forRoute(string $namespace, string $route, string $method = 'GET'): ?WP_REST_Controller
    {
        $full = sprintf('/%s%s', trim($namespace, '/'), $route);

        foreach (rest_get_server()->get_routes()[$full] ?? [] as $handler) {
            if (!is_array($handler) || ($handler['methods'][$method] ?? false) !== true) {
                continue;
            }

            $callback = $handler['callback'] ?? null;

            if (is_array($callback) && ($callback[0] ?? null) instanceof WP_REST_Controller) {
                return $callback[0];
            }
        }

        return null;
    }

    /**
     * The registered controller class, or the core default when it cannot serve
     * the route.
     *
     * A class that does not extend the default is not a narrower controller, it is
     * a different API: the managed operations call `get_items()` and its siblings,
     * which mean nothing above that class. Falling back keeps the contract and the
     * runtime on one controller, which is the property that has to hold, and it
     * leaves the route working rather than fatal.
     *
     * @param class-string $default
     * @return class-string
     */
    private static function declaredClass(mixed $declared, string $default): string
    {
        if (!is_string($declared) || $declared === '' || !class_exists($declared)) {
            return $default;
        }

        return is_a($declared, $default, true) ? $declared : $default;
    }
}
