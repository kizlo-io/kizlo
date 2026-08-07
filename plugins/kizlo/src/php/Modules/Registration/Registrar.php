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
