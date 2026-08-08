<?php

namespace Kizlo\Tests\Registration;

use Kizlo\Modules\Registration\ItemDeleter;
use Kizlo\Tests\TestCase;

/**
 * Item deletion runs in resumable batches: post types delete their posts and
 * taxonomies delete only their terms, never posts.
 */
class ItemDeleterTest extends TestCase
{
    protected function tearDown(): void
    {
        if (post_type_exists('book')) {
            unregister_post_type('book');
        }

        if (taxonomy_exists('genre')) {
            unregister_taxonomy('genre');
        }

        parent::tearDown();
    }

    public function test_posts_are_deleted_in_resumable_batches(): void
    {
        register_post_type('book', ['public' => true]);
        $this->factory()->post->create_many(3, ['post_type' => 'book']);

        $progress = ItemDeleter::start('book', ItemDeleter::KIND_POST_TYPE);
        $this->assertSame(3, $progress['total']);
        $this->assertFalse($progress['complete']);

        $progress = ItemDeleter::processBatch('book', 2);
        $this->assertSame(2, $progress['deleted']);
        $this->assertSame(1, $progress['remaining']);
        $this->assertFalse($progress['complete']);

        $progress = ItemDeleter::processBatch('book', 2);
        $this->assertTrue($progress['complete']);
        $this->assertSame(3, $progress['deleted']);

        $this->assertCount(0, get_posts(['post_type' => 'book', 'post_status' => 'any']));
    }

    public function test_taxonomy_deletion_removes_terms_but_keeps_posts(): void
    {
        register_post_type('book', ['public' => true]);
        register_taxonomy('genre', 'book', ['public' => true]);

        $post = $this->factory()->post->create(['post_type' => 'book']);
        $this->factory()->term->create_many(2, ['taxonomy' => 'genre']);
        wp_set_object_terms($post, ['fiction'], 'genre');

        $progress = ItemDeleter::start('genre', ItemDeleter::KIND_TAXONOMY);
        $this->assertGreaterThanOrEqual(2, $progress['total']);

        do {
            $progress = ItemDeleter::processBatch('genre', 5);
        } while (!$progress['complete'] && $progress['remaining'] > 0);

        $this->assertTrue($progress['complete']);
        $this->assertSame(0, (int) wp_count_terms(['taxonomy' => 'genre', 'hide_empty' => false]));

        // The post itself is untouched.
        $this->assertNotNull(get_post($post));
        $this->assertSame('book', get_post($post)->post_type);
    }

    public function test_completed_job_can_be_cleared(): void
    {
        register_post_type('book', ['public' => true]);

        ItemDeleter::start('book', ItemDeleter::KIND_POST_TYPE);
        $this->assertNotNull(ItemDeleter::get('book'));

        ItemDeleter::clear('book');
        $this->assertNull(ItemDeleter::get('book'));
    }
}
