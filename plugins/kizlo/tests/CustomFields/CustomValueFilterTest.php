<?php

namespace Kizlo\Tests\CustomFields;

use WP_Post;
use WP_Term;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\Tests\Seo\SeoTestCase;
use Kizlo\Modules\Post\PostExtension;
use Kizlo\Modules\PostType\PostTypeExtension;
use Kizlo\Modules\Taxonomy\TermExtension;

/**
 * The runtime half of the `custom` extension hooks: an integration merges its
 * namespaced sub-object into the resolved values just before they are set on the
 * response, so `kizlo.custom.<namespace>` is emitted alongside the configured
 * Kizlo fields. Paired with the schema filters so the payload matches the
 * description.
 */
class CustomValueFilterTest extends SeoTestCase
{
    protected function tearDown(): void
    {
        remove_all_filters('kizlo_post_type_custom_values');
        remove_all_filters('kizlo_taxonomy_custom_values');

        parent::tearDown();
    }

    public function test_the_post_filter_receives_the_values_and_post_on_the_posts_route(): void
    {
        $this->seedSettings();
        $post = $this->createPost();

        $received = null;
        add_filter('kizlo_post_type_custom_values', function (array $custom, WP_Post $subject) use (&$received): array {
            $received       = ['custom' => $custom, 'post' => $subject];
            $custom['acme'] = ['ok' => true];

            return $custom;
        }, 10, 2);

        $response = (new PostExtension())->prepare(
            new WP_REST_Response(['id' => $post->ID]),
            $post,
            new WP_REST_Request('GET', '/wp/v2/posts'),
        );
        $custom = (array) $response->get_data()['kizlo']['custom'];

        $this->assertIsArray($received['custom']);
        $this->assertSame($post->ID, $received['post']->ID);
        $this->assertSame(['ok' => true], $custom['acme']);
    }

    public function test_the_post_filter_also_runs_on_the_post_types_route(): void
    {
        $this->seedSettings();
        $post = $this->createPost();

        add_filter('kizlo_post_type_custom_values', static function (array $custom, WP_Post $subject): array {
            $custom['acme'] = ['id' => $subject->ID];

            return $custom;
        }, 10, 2);

        $data   = (new PostTypeExtension())->extendSingle(['id' => $post->ID, 'author' => $post->post_author]);
        $custom = (array) $data['kizlo']['custom'];

        $this->assertSame(['id' => $post->ID], $custom['acme']);
    }

    public function test_the_taxonomy_filter_receives_the_values_and_term(): void
    {
        $this->seedSettings();

        $term_id = self::factory()->term->create(['taxonomy' => 'category', 'name' => 'News']);
        $term    = get_term($term_id, 'category');
        $this->assertInstanceOf(WP_Term::class, $term);

        $received = null;
        add_filter('kizlo_taxonomy_custom_values', function (array $custom, WP_Term $subject) use (&$received): array {
            $received       = ['custom' => $custom, 'term' => $subject];
            $custom['acme'] = ['term' => $subject->term_id];

            return $custom;
        }, 10, 2);

        $response = (new TermExtension())->prepare(
            new WP_REST_Response(['id' => $term_id]),
            $term,
            new WP_REST_Request('GET', '/wp/v2/categories'),
        );
        $custom = (array) $response->get_data()['kizlo']['custom'];

        $this->assertIsArray($received['custom']);
        $this->assertSame($term_id, $received['term']->term_id);
        $this->assertSame(['term' => $term_id], $custom['acme']);
    }

    public function test_without_a_listener_the_custom_object_is_unchanged(): void
    {
        $this->seedSettings();
        $post = $this->createPost();

        $data = (new PostTypeExtension())->extendListItem(['id' => $post->ID, 'author' => $post->post_author]);

        $this->assertSame([], (array) $data['kizlo']['custom']);
    }
}
