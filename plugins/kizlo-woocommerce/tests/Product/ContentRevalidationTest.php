<?php

namespace Kizlo\WooCommerce\Tests\Product;

use Kizlo\Modules\Post\ContentChanges;
use Kizlo\Modules\Post\ContentDependencies;
use Kizlo\Modules\Settings\Site\SiteSettings;
use Kizlo\Modules\Settings\Webhook\WebhookSettings;
use Kizlo\Modules\Webhook\WebhookModule;
use Kizlo\WooCommerce\Modules\Product\ProductModule;
use Kizlo\WooCommerce\Tests\TestCase;
use WC_Product_Simple;
use WC_Product_Variable;
use WC_Product_Variation;
use WC_Product_Attribute;

class ContentRevalidationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        foreach (['posts', 'terms', 'pending', 'public'] as $name) {
            $property = new \ReflectionProperty(ContentChanges::class, $name);
            $property->setAccessible(true);
            $property->setValue(null, []);
        }
        (new \Kizlo\WooCommerce\Modules\Integration\CoreIntegration())->register();
        (new \Kizlo\WooCommerce\Modules\Variation\VariationListener())->register();
        (new ProductModule())->register();
        \Kizlo\Modules\Settings\Settings::invalidateCache();
        SiteSettings::load()->setSecret('secret')->setBackendUrl(null)->save();
        WebhookSettings::load()->setWebhookUrls(['https://receiver.example/webhooks'])->save();
    }

    private function events(): array
    {
        ContentChanges::flush();
        $ids = get_posts(['post_type' => WebhookModule::TYPE, 'post_status' => 'pending', 'numberposts' => 200, 'orderby' => 'ID', 'order' => 'ASC', 'fields' => 'ids']);
        return array_map(static fn($id) => json_decode(json_decode(get_post($id)->post_content, true)['body'], true), $ids);
    }

    public function test_programmatic_product_price_and_local_attribute_saves_emit_content_with_terms(): void
    {
        $category = self::factory()->term->create(['taxonomy' => 'product_cat']);
        $product = new WC_Product_Simple();
        $product->set_name('Public fixture');
        $product->set_status('publish');
        $product->set_regular_price('10');
        $product->set_category_ids([$category]);
        $attribute = new WC_Product_Attribute();
        $attribute->set_name('Local fabric');
        $attribute->set_options(['Cotton']);
        $product->set_attributes([$attribute]);
        $product->save();
        $product->set_regular_price('12');
        $product->save();
        $events = array_values(array_filter($this->events(), fn($event) => ($event['data']['post_id'] ?? null) === $product->get_id()));
        $this->assertNotEmpty($events);
        $this->assertContains('post.updated', array_column($events, 'type'));
        foreach ($events as $event) {
            $this->assertContains($category, $event['data']['affected_terms']['product_cat']);
            foreach ($event['data']['affected_terms'] as $ids) $this->assertNotContains(0, $ids);
            $this->assertNotEmpty($event['data']['url']);
        }
        $extensions = (new ProductModule())->storeProductExtensionData($product);
        $this->assertArrayNotHasKey('terms', $extensions);
        $this->assertArrayNotHasKey('term_ancestors', $extensions);
        $rest = (new ProductModule())->extendProduct([], $product);
        $this->assertArrayNotHasKey('terms', $rest['kizlo']);
        $this->assertArrayNotHasKey('term_ancestors', $rest['kizlo']);
        $stored = (array) $rest['kizlo']['store_product'];
        $categoryRef = (array) $stored['categories'][0];
        $this->assertSame($category, $categoryRef['id']);
    }

    public function test_variation_reparent_and_delete_invalidate_both_parents_after_persistence(): void
    {
        $one = new WC_Product_Variable();
        $one->set_name('Parent one'); $one->set_status('publish'); $one->save();
        $two = new WC_Product_Variable();
        $two->set_name('Parent two'); $two->set_status('publish'); $two->save();
        $variation = new WC_Product_Variation();
        $variation->set_parent_id($one->get_id()); $variation->set_regular_price('10'); $variation->save();
        $before = count($this->events());
        $variation->set_parent_id($two->get_id()); $variation->save();
        $moved = array_slice($this->events(), $before);
        $movedIds = array_column(array_column($moved, 'data'), 'post_id');
        $this->assertContains($one->get_id(), $movedIds);
        $this->assertContains($two->get_id(), $movedIds);
        $before = count($this->events());
        $variation->delete(true);
        $deleted = array_slice($this->events(), $before);
        $this->assertContains($two->get_id(), array_column(array_column($deleted, 'data'), 'post_id'));
        $updated = array_values(array_filter($this->events(), static fn($event) => $event['type'] === 'post.updated'));
        $ids = array_column(array_column($updated, 'data'), 'post_id');
        $this->assertContains($one->get_id(), $ids);
        $this->assertContains($two->get_id(), $ids);
    }

    public function test_deleting_a_product_category_emits_its_reparented_child(): void
    {
        $parent = self::factory()->term->create(['taxonomy' => 'product_cat']);
        $child = self::factory()->term->create(['taxonomy' => 'product_cat', 'parent' => $parent]);
        $before = count($this->events());
        $this->assertTrue(wp_delete_term($parent, 'product_cat'));
        $this->assertSame(0, get_term($child, 'product_cat')->parent);
        $events = array_slice($this->events(), $before);
        $updates = array_values(array_filter($events, static fn($event) => $event['type'] === 'term.updated' && $event['data']['term_id'] === $child));
        $this->assertCount(1, $updates);
        $this->assertEqualsCanonicalizing([$child, $parent], $updates[0]['data']['affected_terms']['product_cat']);
    }

    public function test_attribute_definition_changes_emit_old_and_new_taxonomy_keys_without_fake_terms(): void
    {
        $id = wc_create_attribute(['name' => 'Fixture color', 'slug' => 'fixture_color']);
        $this->assertIsInt($id);
        wc_update_attribute($id, ['name' => 'Fixture hue', 'slug' => 'fixture_hue']);
        wc_delete_attribute($id);
        $events = array_values(array_filter($this->events(), static fn($event) => $event['type'] === 'settings.taxonomy.updated'));
        $keys = array_column(array_column($events, 'data'), 'key');
        $this->assertContains('pa_fixture_color', $keys);
        $this->assertContains('pa_fixture_hue', $keys);
    }
    public function test_global_attribute_options_are_shared_terms_but_private_product_bookkeeping_is_not(): void
    {
        $attributeId = wc_create_attribute(['name' => 'Dependency color', 'slug' => 'dependency_color']);
        register_taxonomy('pa_dependency_color', ['product'], ['public' => false, 'show_in_rest' => false]);
        try {
            $term = self::factory()->term->create(['taxonomy' => 'pa_dependency_color']);
            $product = new WC_Product_Simple();
            $product->set_status('publish'); $product->set_name('Attribute fixture'); $product->save();
            wp_set_object_terms($product->get_id(), [$term], 'pa_dependency_color');
            $map = ContentDependencies::affected($product->get_id());
            $this->assertSame([$term], $map['pa_dependency_color']);
            $this->assertArrayNotHasKey('product_visibility', $map);
            wp_update_term($term, 'pa_dependency_color', ['name' => 'Renamed color']);
            $events = array_values(array_filter($this->events(), static fn($event) => ($event['data']['term_id'] ?? null) === $term));
            $this->assertNotEmpty($events);
            $this->assertContains($term, end($events)['data']['affected_terms']['pa_dependency_color']);
        } finally {
            unregister_taxonomy('pa_dependency_color');
            wc_delete_attribute($attributeId);
        }
    }

}
