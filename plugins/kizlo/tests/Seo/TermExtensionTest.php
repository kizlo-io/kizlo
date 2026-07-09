<?php

namespace Kizlo\Tests\Seo;

use WP_Term;
use Kizlo\Modules\Taxonomy\TermExtension;

/**
 * The REST delivery layer for terms: `TermExtension` injects the resolved SEO
 * head + JSON-LD (built from taxonomy templates and per-term overrides) into the
 * single-term response, and a light term base into every response.
 */
class TermExtensionTest extends SeoTestCase
{
    private function category(string $name, string $slug): WP_Term
    {
        $id = self::factory()->category->create(['name' => $name, 'slug' => $slug]);

        return get_term($id, 'category');
    }

    public function test_single_response_carries_resolved_seo_head_and_schema(): void
    {
        $this->seedSettings();
        $term = $this->category('News', 'news');

        $data = (new TermExtension())->extendSingle(['id' => $term->term_id], $term);

        $this->assertSame('News | Example Site', $data['kizlo']['seo']['head']['title']);
        $this->assertArrayHasKey('@graph', $data['kizlo']['seo']['schema']);
        $this->assertSame('News', $data['kizlo']['name']);
        $this->assertSame('news', $data['kizlo']['slug']);
    }

    public function test_single_response_reflects_per_term_overrides(): void
    {
        $this->seedSettings();
        $term = $this->category('News', 'news');

        $this->applyTermOverrides($term->term_id, ['title' => 'Overridden term title']);

        $data = (new TermExtension())->extendSingle(['id' => $term->term_id], $term);

        $this->assertSame('Overridden term title', $data['kizlo']['seo']['head']['title']);
    }

    public function test_list_item_carries_base_but_not_seo(): void
    {
        $this->seedSettings();
        $term = $this->category('News', 'news');

        $data = (new TermExtension())->extendListItem(['id' => $term->term_id], $term);

        $this->assertSame('News', $data['kizlo']['name']);
        $this->assertArrayNotHasKey('seo', $data['kizlo']);
    }
}
