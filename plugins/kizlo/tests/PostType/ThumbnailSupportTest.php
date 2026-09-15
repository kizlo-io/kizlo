<?php

namespace Kizlo\Tests\PostType;

use Kizlo\Modules\PostType\ThumbnailSupport;
use Kizlo\Modules\Registration\PostTypeRegistration;
use Kizlo\Modules\Registration\Registrar;
use Kizlo\Tests\TestCase;

/**
 * Kizlo declares `post-thumbnails` for the managed post types that support
 * thumbnails, which is the half of the Featured image panel that
 * register_post_type() cannot supply.
 */
class ThumbnailSupportTest extends TestCase
{
    /** @var mixed */
    private $previous_feature;

    protected function setUp(): void
    {
        parent::setUp();

        // WooCommerce declares post-thumbnails globally in the test stack, which
        // would satisfy every assertion below without Kizlo doing anything.
        global $_wp_theme_features;
        $this->previous_feature = $_wp_theme_features['post-thumbnails'] ?? null;
        unset($_wp_theme_features['post-thumbnails']);
    }

    protected function tearDown(): void
    {
        global $_wp_theme_features;
        if ($this->previous_feature === null) {
            unset($_wp_theme_features['post-thumbnails']);
        } else {
            $_wp_theme_features['post-thumbnails'] = $this->previous_feature;
        }

        parent::tearDown();
    }

    /** @param string[] $supports */
    private function registerPostType(string $key, array $supports): void
    {
        $definition = new PostTypeRegistration();
        $definition->setData([
            'key'            => $key,
            'singular_label' => ucfirst($key),
            'plural_label'   => ucfirst($key) . 's',
            'supports'       => $supports,
        ]);
        $definition->save($key);

        $registrar = new Registrar();
        $registrar->register();
        $registrar->registerObjects();
    }

    public function test_a_managed_type_supporting_thumbnails_gets_theme_support(): void
    {
        $this->registerPostType('book', ['title', 'editor', 'thumbnail']);

        (new ThumbnailSupport())->declareSupport();

        $this->assertTrue(current_theme_supports('post-thumbnails', 'book'));
    }

    public function test_a_managed_type_without_thumbnail_support_is_left_out(): void
    {
        $this->registerPostType('movie', ['title', 'editor']);

        (new ThumbnailSupport())->declareSupport();

        $this->assertNotContains('movie', get_theme_support('post-thumbnails')[0]);
        $this->assertFalse(current_theme_supports('post-thumbnails', 'movie'));
    }

    public function test_core_posts_and_pages_keep_their_featured_image_panel(): void
    {
        (new ThumbnailSupport())->declareSupport();

        $declared = get_theme_support('post-thumbnails')[0];

        $this->assertContains('post', $declared);
        $this->assertContains('page', $declared);
    }

    public function test_an_unmanaged_type_gets_no_theme_support(): void
    {
        register_post_type('unmanaged', ['public' => true, 'show_in_rest' => true, 'supports' => ['title', 'thumbnail']]);

        (new ThumbnailSupport())->declareSupport();

        $this->assertFalse(current_theme_supports('post-thumbnails', 'unmanaged'));
    }
}
