<?php

namespace Kizlo\Modules\Registration;

/**
 * Registers active Kizlo-owned post types and taxonomies with WordPress and
 * opts them into the Kizlo pipeline.
 *
 * Post types are registered before taxonomies so relationships resolve, and an
 * object is never registered over one an existing plugin already owns. Active
 * definitions are appended to the `kizlo_included_*` filters so they flow through
 * the settings / custom-fields / SEO / pathname / webhook / API pipeline exactly
 * like a third-party opt-in.
 */
class Registrar
{
    /**
     * Whether {@see registerObjects()} has run, so the post type and taxonomy
     * registry is complete for this request.
     */
    private static bool $registered = false;

    public function register(): void
    {
        add_filter('kizlo_included_post_types', [$this, 'includePostTypes']);
        add_filter('kizlo_included_taxonomies', [$this, 'includeTaxonomies']);

        // Priority 20: after core and typical third-party registrations, so an
        // existing object is already present and we skip it rather than clobber it.
        add_action('init', [$this, 'registerObjects'], 20);
    }

    public function registerObjects(): void
    {
        $this->registerPostTypes();
        $this->registerTaxonomies();

        RewriteFlusher::flushIfPending();

        self::$registered = true;
    }

    /**
     * Whether every post type and taxonomy this request will have is registered.
     *
     * Membership is only settled once this is true: extension plugins join the
     * `kizlo_internal_*` filters on `kizlo_loaded`, and WordPress registers the
     * objects themselves on `init`. Anything deriving a set of objects, rather
     * than reading one it was handed, has to wait for it.
     */
    public static function objectsRegistered(): bool
    {
        return self::$registered;
    }

    /**
     * Forget that registration ran. Test seam: WordPress resets its hooks between
     * tests but a static flag outlives them.
     */
    public static function reset(): void
    {
        self::$registered = false;
    }

    private function registerPostTypes(): void
    {
        foreach (PostTypeRegistration::all() as $key => $definition) {
            if (!$definition->isActive() || post_type_exists($key)) {
                continue;
            }

            register_post_type($key, $definition->toArgs());
        }
    }

    private function registerTaxonomies(): void
    {
        foreach (TaxonomyRegistration::all() as $key => $definition) {
            if (!$definition->isActive() || taxonomy_exists($key)) {
                continue;
            }

            register_taxonomy($key, $definition->getConnectedPostTypes(), $definition->toArgs());
        }
    }

    /**
     * @param string[] $post_types
     * @return string[]
     */
    public function includePostTypes(array $post_types): array
    {
        return array_values(array_unique(array_merge($post_types, PostTypeRegistration::activeKeys())));
    }

    /**
     * @param string[] $taxonomies
     * @return string[]
     */
    public function includeTaxonomies(array $taxonomies): array
    {
        return array_values(array_unique(array_merge($taxonomies, TaxonomyRegistration::activeKeys())));
    }
}
