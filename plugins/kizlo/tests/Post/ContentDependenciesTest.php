<?php

namespace Kizlo\Tests\Post;

use Kizlo\Modules\Post\ContentDependencies;
use Kizlo\Modules\Post\ContentChanges;
use Kizlo\Modules\Settings\Site\SiteSettings;
use Kizlo\Modules\Settings\Webhook\WebhookSettings;
use Kizlo\Modules\Webhook\WebhookModule;
use Kizlo\Tests\TestCase;

class ContentDependenciesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        foreach (['posts', 'terms', 'pending', 'public'] as $name) {
            $property = new \ReflectionProperty(ContentChanges::class, $name);
            $property->setAccessible(true);
            $property->setValue(null, []);
        }
        SiteSettings::load()->setSecret('secret')->setBackendUrl(null)->save();
        WebhookSettings::load()->setWebhookUrls(['https://receiver.example/webhooks'])->save();
    }

    private function events(int $post_id): array
    {
        ContentChanges::flush();
        $actions = get_posts(['post_type' => WebhookModule::TYPE, 'post_status' => 'pending', 'numberposts' => 200, 'orderby' => 'ID', 'order' => 'ASC', 'fields' => 'ids']);
        return array_values(array_filter(array_map(static fn($id) => json_decode(json_decode(get_post($id)->post_content, true)['body'], true), $actions), static fn($event) => ($event['data']['post_id'] ?? null) === $post_id));
    }

    public function test_webhook_dependencies_include_all_assignments_and_deduplicated_ancestors(): void
    {
        $root = self::factory()->term->create(['taxonomy' => 'category']);
        $child = self::factory()->term->create(['taxonomy' => 'category', 'parent' => $root]);
        $id = self::factory()->post->create(['post_status' => 'publish']);
        $terms = [$child];
        for ($i = 0; $i < 35; $i++) $terms[] = self::factory()->term->create(['taxonomy' => 'category']);
        wp_set_post_terms($id, $terms, 'category');
        $data = ContentDependencies::affected($id);
        $this->assertCount(37, $data['category']);
        $this->assertContains($root, $data['category']);
        wp_set_post_terms($id, [$root, $child], 'category');
        $this->assertCount(2, ContentDependencies::affected($id)['category']);
        register_taxonomy('hidden', 'post', ['public' => false]);
        wp_set_object_terms($id, ['secret'], 'hidden');
        $this->assertArrayNotHasKey('hidden', ContentDependencies::affected($id));
    }

    public function test_category_move_and_removal_retain_previous_and_current_dependencies(): void
    {
        $a = self::factory()->term->create(['taxonomy' => 'category']);
        $b = self::factory()->term->create(['taxonomy' => 'category']);
        $id = self::factory()->post->create(['post_status' => 'publish', 'post_category' => [$a]]);
        wp_set_post_terms($id, [$b], 'category');
        $events = $this->events($id);
        $affected = array_merge(...array_map(static fn($event) => $event['data']['affected_terms']['category'] ?? [], $events));
        $this->assertContains($a, $affected);
        $this->assertContains($b, $affected);
        wp_remove_object_terms($id, $b, 'category');
        $events = $this->events($id);
        $last = end($events);
        $this->assertContains($b, $last['data']['affected_terms']['category']);
    }

    public function test_unpublish_delete_preserve_public_url_and_dependencies(): void
    {
        $term = self::factory()->term->create(['taxonomy' => 'category']);
        $id = self::factory()->post->create(['post_status' => 'publish', 'post_category' => [$term]]);
        $url = \Kizlo\Support\Utils::getSettings()->resolvePostUrl(get_post($id), \Kizlo\Support\Utils::getSettings()->postTypes->get('post'));
        wp_update_post(['ID' => $id, 'post_status' => 'draft']);
        wp_delete_post($id, true);
        $events = $this->events($id);
        $this->assertContains('post.updated', array_column($events, 'type'));
        $this->assertContains('post.deleted', array_column($events, 'type'));
        foreach ($events as $event) {
            $this->assertContains($term, $event['data']['affected_terms']['category']);
            $this->assertSame($url, $event['data']['url']);
        }
    }

    public function test_cycles_are_unknown_instead_of_empty(): void
    {
        $a = self::factory()->term->create(['taxonomy' => 'category']);
        $b = self::factory()->term->create(['taxonomy' => 'category', 'parent' => $a]);
        global $wpdb;
        $wpdb->update($wpdb->term_taxonomy, ['parent' => $b], ['term_id' => $a, 'taxonomy' => 'category']);
        clean_term_cache([$a, $b], 'category');
        $id = self::factory()->post->create(['post_status' => 'draft']);
        wp_set_object_terms($id, [$b], 'category');
        $this->assertNull(ContentDependencies::affected($id));
    }
    public function test_term_reparent_and_delete_retain_old_and_new_ancestor_chains(): void
    {
        $old = self::factory()->term->create(['taxonomy' => 'category']);
        $next = self::factory()->term->create(['taxonomy' => 'category']);
        $child = self::factory()->term->create(['taxonomy' => 'category', 'parent' => $old]);
        ContentChanges::flush();
        wp_update_term($child, 'category', ['parent' => $next]);
        wp_delete_term($child, 'category');
        ContentChanges::flush();
        $actions = get_posts(['post_type' => WebhookModule::TYPE, 'post_status' => 'pending', 'numberposts' => 200, 'orderby' => 'ID', 'order' => 'ASC', 'fields' => 'ids']);
        $events = array_map(static fn($id) => json_decode(json_decode(get_post($id)->post_content, true)['body'], true), $actions);
        $affected = [];
        foreach ($events as $event) if (($event['data']['term_id'] ?? null) === $child) $affected = array_merge($affected, $event['data']['affected_terms']['category']);
        $this->assertContains($old, $affected);
        $this->assertContains($next, $affected);
        $this->assertContains($child, $affected);
    }

    public function test_parent_changes_include_descendants_but_product_assignments_do_not_expand_into_siblings(): void
    {
        $old_root = self::factory()->term->create(['taxonomy' => 'category']);
        $new_root = self::factory()->term->create(['taxonomy' => 'category']);
        $parent = self::factory()->term->create(['taxonomy' => 'category', 'parent' => $old_root]);
        $child = self::factory()->term->create(['taxonomy' => 'category', 'parent' => $parent]);
        $leaf = self::factory()->term->create(['taxonomy' => 'category', 'parent' => $child]);
        $sibling = self::factory()->term->create(['taxonomy' => 'category', 'parent' => $parent]);
        $unrelated = self::factory()->term->create(['taxonomy' => 'category']);
        $post = self::factory()->post->create(['post_status' => 'publish', 'post_category' => [$leaf]]);
        $this->assertEqualsCanonicalizing([$leaf, $child, $parent, $old_root], ContentDependencies::affected($post)['category']);
        $this->assertEqualsCanonicalizing([$leaf], wp_get_object_terms($post, 'category', ['fields' => 'ids']));
        ContentChanges::flush();
        $before = get_posts(['post_type' => WebhookModule::TYPE, 'post_status' => 'pending', 'numberposts' => -1, 'fields' => 'ids']);

        wp_update_term($parent, 'category', ['slug' => 'changed-parent', 'parent' => $new_root]);
        ContentChanges::flush();
        $jobs = get_posts(['post_type' => WebhookModule::TYPE, 'post_status' => 'pending', 'numberposts' => -1, 'post__not_in' => $before]);
        $events = array_map(static fn($job) => json_decode(json_decode($job->post_content, true)['body'], true), $jobs);
        $updates = array_values(array_filter($events, static fn($event) => ($event['data']['term_id'] ?? null) === $parent));
        $this->assertCount(1, $updates);
        $this->assertEqualsCanonicalizing([$parent, $child, $leaf, $sibling, $old_root, $new_root], $updates[0]['data']['affected_terms']['category']);
        $this->assertNotContains($unrelated, $updates[0]['data']['affected_terms']['category']);
        $this->assertEqualsCanonicalizing([$leaf], wp_get_object_terms($post, 'category', ['fields' => 'ids']));
        $this->assertNotContains($sibling, ContentDependencies::affected($post)['category']);
    }

    public function test_parent_deletion_retains_the_full_previous_subtree(): void
    {
        $root = self::factory()->term->create(['taxonomy' => 'category']);
        $parent = self::factory()->term->create(['taxonomy' => 'category', 'parent' => $root]);
        $child = self::factory()->term->create(['taxonomy' => 'category', 'parent' => $parent]);
        $leaf = self::factory()->term->create(['taxonomy' => 'category', 'parent' => $child]);
        ContentChanges::flush();
        $before = get_posts(['post_type' => WebhookModule::TYPE, 'post_status' => 'pending', 'numberposts' => -1, 'fields' => 'ids']);
        wp_delete_term($parent, 'category');
        ContentChanges::flush();
        $jobs = get_posts(['post_type' => WebhookModule::TYPE, 'post_status' => 'pending', 'numberposts' => -1, 'post__not_in' => $before]);
        $events = array_map(static fn($job) => json_decode(json_decode($job->post_content, true)['body'], true), $jobs);
        $deleted = array_values(array_filter($events, static fn($event) => $event['type'] === 'term.deleted' && $event['data']['term_id'] === $parent));
        $this->assertCount(1, $deleted);
        $this->assertEqualsCanonicalizing([$root, $parent, $child, $leaf], $deleted[0]['data']['affected_terms']['category']);
        $updates = array_values(array_filter($events, static fn($event) => $event['type'] === 'term.updated' && $event['data']['term_id'] === $child));
        $this->assertEqualsCanonicalizing([$root, $parent, $child, $leaf], $updates[0]['data']['affected_terms']['category']);
    }

    public function test_descendant_read_failure_is_unknown_and_large_subtrees_are_complete(): void
    {
        $parent = self::factory()->term->create(['taxonomy' => 'category']);
        $children = [];
        for ($i = 0; $i < 110; $i++) $children[] = self::factory()->term->create(['taxonomy' => 'category', 'parent' => $parent]);
        $this->assertEqualsCanonicalizing([$parent, ...$children], ContentDependencies::termChange(get_term($parent, 'category'))['category']);
        $term = clone get_term($parent, 'category');
        $term->taxonomy = 'missing_taxonomy';
        $this->assertNull(ContentDependencies::termChange($term));
    }

    public function test_parent_deletion_emits_updates_for_reparented_children(): void
    {
        $root = self::factory()->term->create(['taxonomy' => 'category']);
        $parent = self::factory()->term->create(['taxonomy' => 'category', 'parent' => $root]);
        $children = [
            self::factory()->term->create(['taxonomy' => 'category', 'parent' => $parent]),
            self::factory()->term->create(['taxonomy' => 'category', 'parent' => $parent]),
        ];
        $unrelated = self::factory()->term->create(['taxonomy' => 'category', 'parent' => $root]);
        // Term-taxonomy IDs are not interchangeable with the public term IDs.
        global $wpdb;
        $term = get_term($children[0], 'category');
        $wpdb->update($wpdb->term_taxonomy, ['term_taxonomy_id' => $term->term_taxonomy_id + 10000], ['term_taxonomy_id' => $term->term_taxonomy_id]);
        clean_term_cache($children[0], 'category');
        ContentChanges::flush();
        $before = get_posts(['post_type' => WebhookModule::TYPE, 'post_status' => 'pending', 'numberposts' => -1, 'fields' => 'ids']);

        $this->assertTrue(wp_delete_term($parent, 'category'));
        ContentChanges::flush();
        $jobs = get_posts(['post_type' => WebhookModule::TYPE, 'post_status' => 'pending', 'numberposts' => -1, 'post__not_in' => $before]);
        $events = array_map(static fn($job) => json_decode(json_decode($job->post_content, true)['body'], true), $jobs);
        foreach ($children as $child) {
            $this->assertSame($root, get_term($child, 'category')->parent);
            $updates = array_values(array_filter($events, static fn($event) => $event['type'] === 'term.updated' && $event['data']['term_id'] === $child));
            $this->assertCount(1, $updates);
            $this->assertEqualsCanonicalizing([$child, $parent, $root], $updates[0]['data']['affected_terms']['category']);
        }
        $this->assertNotContains($unrelated, array_column(array_column($events, 'data'), 'term_id'));
    }

    public function test_reparent_hooks_without_a_persisted_parent_change_do_not_emit(): void
    {
        $parent = self::factory()->term->create(['taxonomy' => 'category']);
        $child = self::factory()->term->create(['taxonomy' => 'category', 'parent' => $parent]);
        ContentChanges::flush();
        $before = get_posts(['post_type' => WebhookModule::TYPE, 'post_status' => 'pending', 'numberposts' => -1, 'fields' => 'ids']);
        $tt_id = get_term($child, 'category')->term_taxonomy_id;
        do_action('edit_term_taxonomies', [$tt_id]);
        do_action('edited_term_taxonomies', [$tt_id]);
        ContentChanges::flush();
        $this->assertSame($before, get_posts(['post_type' => WebhookModule::TYPE, 'post_status' => 'pending', 'numberposts' => -1, 'fields' => 'ids']));
    }

    public function test_pre_mutation_capture_without_success_never_emits(): void
    {
        $id = self::factory()->post->create(['post_status' => 'publish']);
        $before = count($this->events($id));
        ContentChanges::capturePost($id);
        $this->assertCount($before, $this->events($id));
    }

    public function test_draft_only_edits_and_autosaves_do_not_emit_public_content_events(): void
    {
        $id = self::factory()->post->create(['post_status' => 'draft']);
        wp_update_post(['ID' => $id, 'post_title' => 'Still private']);
        $this->assertSame([], $this->events($id));
        $revision = wp_insert_post(['post_type' => 'revision', 'post_status' => 'inherit', 'post_parent' => $id, 'post_title' => 'Autosave']);
        $this->assertSame([], $this->events($revision));
    }

}
