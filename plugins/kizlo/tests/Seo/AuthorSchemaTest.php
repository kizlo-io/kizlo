<?php

namespace Kizlo\Tests\Seo;

use WP_User;
use Kizlo\Modules\Seo\AuthorSchema;

/**
 * Author archive pages: enable/visibility gating (which controls both robots and
 * whether the archive is even eligible for a sitemap), the ProfilePage JSON-LD,
 * and the per-author sitemap entries restricted to authors who have published.
 */
class AuthorSchemaTest extends SeoTestCase
{
    private function author(array $args = []): WP_User
    {
        return new WP_User(self::factory()->user->create(array_merge([
            'role'         => 'author',
            'display_name' => 'Ada Lovelace',
            'user_login'   => 'ada',
        ], $args)));
    }

    public function test_build_meta_uses_profile_type_and_author_structure(): void
    {
        $settings = $this->seedSettings(['authors' => ['enabled' => true]]);
        $user     = $this->author();

        $meta = (new AuthorSchema($settings))->buildMeta($user);

        $this->assertSame('Ada Lovelace | Example Site', $meta['title']);
        $this->assertSame('https://example.com/author/ada/', $meta['canonical']);
        $this->assertSame('profile', $meta['og']['type']);
        $this->assertSame('index', $meta['robots']['index']);
    }

    public function test_invisible_authors_report_noindex(): void
    {
        $settings = $this->seedSettings(['authors' => ['enabled' => true, 'search_engine_visibility' => false]]);
        $user     = $this->author();

        $this->assertSame('noindex', (new AuthorSchema($settings))->buildMeta($user)['robots']['index']);
    }

    public function test_json_ld_webpage_is_a_profile_page(): void
    {
        $settings = $this->seedSettings(['authors' => ['enabled' => true]]);
        $user     = $this->author();

        $graph   = (new AuthorSchema($settings))->jsonLd($user)['@graph'];
        $webpage = $this->findNode($graph, 'ProfilePage');

        $this->assertSame(['WebPage', 'ProfilePage'], $webpage['@type']);
        $this->assertNotNull($this->findNode($graph, 'BreadcrumbList'));
    }

    public function test_person_node_carries_archive_url_when_authors_enabled(): void
    {
        $settings = $this->seedSettings(['authors' => ['enabled' => true]]);
        $user     = $this->author();

        $person = null;
        foreach ((new AuthorSchema($settings))->jsonLd($user)['@graph'] as $node) {
            if (($node['@type'] ?? null) === 'Person' && ($node['name'] ?? null) === 'Ada Lovelace') $person = $node;
        }

        $this->assertNotNull($person);
        $this->assertSame('https://example.com/author/ada/', $person['url']);
    }

    public function test_sitemap_entries_only_include_authors_with_published_posts(): void
    {
        $settings = $this->seedSettings(['authors' => ['enabled' => true]]);

        $published = $this->author(['user_login' => 'writer', 'display_name' => 'Writer']);
        $this->createPost(['post_author' => $published->ID]);

        // A second author with no posts must not appear.
        $this->author(['user_login' => 'lurker', 'display_name' => 'Lurker']);

        $entries = (new AuthorSchema($settings))->sitemapEntries();
        $locs    = array_column($entries, 'loc');

        $this->assertContains('https://example.com/author/writer/', $locs);
        $this->assertNotContains('https://example.com/author/lurker/', $locs);
    }

    public function test_sitemap_entries_empty_when_authors_disabled(): void
    {
        $settings = $this->seedSettings(['authors' => ['enabled' => false]]);

        $user = $this->author(['user_login' => 'writer']);
        $this->createPost(['post_author' => $user->ID]);

        $this->assertSame([], (new AuthorSchema($settings))->sitemapEntries());
    }
}
