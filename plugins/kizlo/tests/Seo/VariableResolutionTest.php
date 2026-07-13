<?php

namespace Kizlo\Tests\Seo;

use WP_Term;
use Kizlo\Support\Variables;
use Kizlo\Modules\Seo\SeoBase;

/**
 * End-to-end proof that every variable a picker offers actually resolves.
 *
 * The meta box and settings screens advertise a token list per scope; the
 * resolvers ({@see SeoBase::resolvePostTemplate()} et al) turn those tokens into
 * real values. If a picker offers a token the resolver has no mapping for, the
 * literal `{{token}}` leaks into the rendered SEO output — exactly the class of
 * bug that let `{{excerpt}}` reach pages. These tests join every advertised token
 * for a scope into one template, resolve it against seeded fixtures, and assert
 * nothing is left unreplaced, plus pin the important values individually.
 */
class VariableResolutionTest extends SeoTestCase
{
    private SeoBase $seo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seo = new SeoBase($this->seedSettings());
    }

    /**
     * Assert every token resolves through $resolver with no `{{...}}` left behind.
     *
     * @param callable(string): string $resolver
     * @param list<string>             $tokens
     */
    private function assertAllResolve(callable $resolver, array $tokens): void
    {
        foreach ($tokens as $token) {
            $result = $resolver($token);

            $this->assertStringNotContainsString(
                '{{',
                $result,
                "Token {$token} was not resolved (no resolver mapping)."
            );
        }
    }

    // ====================================================
    // POST
    // ====================================================

    public function test_every_post_variable_resolves(): void
    {
        $author = self::factory()->user->create([
            'role'          => 'author',
            'display_name'  => 'Ada Lovelace',
            'first_name'    => 'Ada',
            'last_name'     => 'Lovelace',
            'description'   => 'Computing pioneer.',
            'user_nicename' => 'ada',
        ]);

        $category = self::factory()->category->create(['name' => 'Science', 'slug' => 'science']);

        $post = $this->createPost([
            'post_title'    => 'Hello World',
            'post_excerpt'  => 'A hand-written excerpt.',
            'post_content'  => 'The body content of the post.',
            'post_author'   => $author,
            'post_category' => [$category],
        ]);

        $resolve = fn(string $template): string => $this->callProtected($this->seo, 'resolvePostTemplate', [$template, $post]);

        // Every content + path token the pickers offer for a post must resolve.
        $this->assertAllResolve($resolve, array_merge(
            array_column(Variables::forPostType('post'), 'value'),
            Variables::POST_TYPE_PATH_VARIABLES,
        ));

        // Pin the values that carry real meaning.
        $this->assertSame('Hello World', $resolve(Variables::TITLE));
        $this->assertSame('Ada Lovelace', $resolve(Variables::AUTHOR));
        // {{excerpt}} is the manual field only; {{content}} is derived from the body.
        $this->assertSame('A hand-written excerpt.', $resolve(Variables::EXCERPT));
        $this->assertStringContainsString('body content of the post', $resolve(Variables::CONTENT));
        $this->assertStringNotContainsString('hand-written excerpt', $resolve(Variables::CONTENT));
        $this->assertSame('Science', $resolve(Variables::CATEGORY));
        $this->assertSame('hello-world', $resolve(Variables::SLUG));
        $this->assertSame('Example Site', $resolve(Variables::SITE_NAME));
        $this->assertSame('The example tagline', $resolve(Variables::TAGLINE));
        $this->assertSame('|', $resolve(Variables::SEPARATOR));
    }

    public function test_every_page_variable_resolves(): void
    {
        $page = $this->createPost([
            'post_type'    => 'page',
            'post_title'   => 'About Us',
            'post_content' => 'Everything about our company.',
        ]);

        $resolve = fn(string $template): string => $this->callProtected($this->seo, 'resolvePostTemplate', [$template, $page]);

        // The page picker excludes excerpt/category; whatever it does offer resolves.
        $this->assertAllResolve($resolve, array_merge(
            array_column(Variables::forPostType('page'), 'value'),
            Variables::POST_TYPE_PATH_VARIABLES,
        ));

        $this->assertSame('About Us', $resolve(Variables::TITLE));
        $this->assertSame('about-us', $resolve(Variables::SLUG));
        // A page has no excerpt field, but {{content}} still summarises its body.
        $this->assertStringContainsString('about our company', $resolve(Variables::CONTENT));
    }

    // ====================================================
    // TAXONOMY
    // ====================================================

    public function test_every_taxonomy_variable_resolves(): void
    {
        $term_id = self::factory()->category->create([
            'name'        => 'Science',
            'slug'        => 'science',
            'description' => 'All science posts.',
        ]);

        /** @var WP_Term $term */
        $term = get_term($term_id);

        $resolve = fn(string $template): string => $this->callProtected($this->seo, 'resolveTermTemplate', [$template, $term]);

        $this->assertAllResolve($resolve, array_merge(
            Variables::TAXONOMY_CONTENT_VARIABLES,
            Variables::TAXONOMY_PATH_VARIABLES,
        ));

        $this->assertSame('Science', $resolve(Variables::TITLE));
        $this->assertSame('science', $resolve(Variables::SLUG));
        $this->assertSame('All science posts.', $resolve(Variables::DESCRIPTION));
        $this->assertSame('Example Site', $resolve(Variables::SITE_NAME));
        $this->assertSame('|', $resolve(Variables::SEPARATOR));
    }

    // ====================================================
    // AUTHOR
    // ====================================================

    public function test_every_author_variable_resolves(): void
    {
        $user_id = self::factory()->user->create([
            'role'          => 'author',
            'display_name'  => 'Ada Lovelace',
            'first_name'    => 'Ada',
            'last_name'     => 'Lovelace',
            'description'   => 'Computing pioneer.',
            'user_nicename' => 'ada',
        ]);
        update_user_meta($user_id, 'kizlo_job_title', 'Mathematician');
        $this->createPost(['post_author' => $user_id]);

        $user = get_userdata($user_id);

        $resolve = fn(string $template): string => $this->callProtected($this->seo, 'resolveAuthorTemplate', [$template, $user]);

        $this->assertAllResolve($resolve, array_merge(
            Variables::AUTHOR_CONTENT_VARIABLES,
            Variables::AUTHOR_PATH_VARIABLES,
        ));

        $this->assertSame('Ada Lovelace', $resolve(Variables::NAME));
        $this->assertSame('Ada', $resolve(Variables::FIRST_NAME));
        $this->assertSame('Lovelace', $resolve(Variables::LAST_NAME));
        $this->assertSame('Computing pioneer.', $resolve(Variables::BIO));
        $this->assertSame('Mathematician', $resolve(Variables::JOB_TITLE));
        $this->assertSame('1', $resolve(Variables::POST_COUNT));
        $this->assertSame('ada', $resolve(Variables::NICENAME));
    }
}