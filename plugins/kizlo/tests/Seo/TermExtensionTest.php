<?php

namespace Kizlo\Tests\Seo;

use WP_Term;
use Kizlo\Modules\Settings\Settings;
use Kizlo\Modules\Taxonomy\TermExtension;

/**
 * The REST delivery layer for terms: `TermExtension` injects the resolved SEO
 * head + JSON-LD (built from taxonomy templates and per-term overrides) into the
 * single-term response, while every response carries the open extension bag.
 */
class TermExtensionTest extends SeoTestCase
{
    private function category(string $name, string $slug): WP_Term
    {
        $id = self::factory()->category->create(['name' => $name, 'slug' => $slug]);

        return get_term($id, 'category');
    }

    /**
     * One filter per managed taxonomy, so binding has to see the complete managed set.
     * `register()` defers to `rest_api_init`, which is after `init`, so by then it does.
     * What this pins is the other half: a taxonomy an extension plugin contributes is
     * in that set even when binding reads a cold settings cache.
     *
     * Asserted against `bind()` rather than `register()` because `did_action(
     * 'rest_api_init')` is process state a previous test may already have set.
     */
    public function test_binding_attaches_filters_for_a_contributed_taxonomy(): void
    {
        register_taxonomy('genre', 'post', ['public' => true, 'show_in_rest' => true]);
        add_filter('kizlo_internal_taxonomies', static fn(array $taxonomies): array => $taxonomies + ['genre' => []]);

        // A fresh request's settings state, so the managed set is there to be read.
        Settings::invalidateCache();

        (new TermExtension())->bind();

        $this->assertNotFalse(has_filter('rest_prepare_genre'));
    }

    public function test_single_response_carries_resolved_seo_head_and_schema(): void
    {
        $this->seedSettings();
        $term = $this->category('News', 'news');

        $data = (new TermExtension())->extendSingle(['id' => $term->term_id], $term);

        $this->assertSame('News | Example Site', $data['kizlo']['seo']['head']['title']);
        $this->assertArrayHasKey('@graph', $data['kizlo']['seo']['schema']);
        $this->assertSame([], $data['kizlo']['extend']);
    }

    public function test_single_response_reflects_per_term_overrides(): void
    {
        $this->seedSettings();
        $term = $this->category('News', 'news');

        $this->applyTermOverrides($term->term_id, ['title' => 'Overridden term title']);

        $data = (new TermExtension())->extendSingle(['id' => $term->term_id], $term);

        $this->assertSame('Overridden term title', $data['kizlo']['seo']['head']['title']);
    }

    public function test_list_item_carries_only_extend_and_not_seo(): void
    {
        $this->seedSettings();
        $term = $this->category('News', 'news');

        $data = (new TermExtension())->extendListItem(['id' => $term->term_id], $term);

        $this->assertSame(['extend'], array_keys($data['kizlo']));
        $this->assertArrayNotHasKey('seo', $data['kizlo']);
    }
}
