<?php

namespace Kizlo\Tests\Support;

use Kizlo\Support\Variables;
use Kizlo\Tests\TestCase;

/**
 * Phase 1 substrate proof: one behavioural assertion against real plugin code,
 * running inside a real WordPress under wp-phpunit. A pass proves the whole chain
 * — the plugin's dev dependencies, test DB provisioning, the container phpunit
 * runner, the plugin's autoloader loading inside WP, and per-test rollback.
 */
class VariablesTest extends TestCase
{
    public function test_resolves_context_variables_in_a_template(): void
    {
        $result = Variables::resolve('{{title}} by {{author}} on {{date}}', [
            'title'  => 'Hello World',
            'author' => 'Ada Lovelace',
            'date'   => '2026/07/06',
        ]);

        $this->assertSame('Hello World by Ada Lovelace on 2026/07/06', $result);
    }

    /**
     * Pull the variable tokens out of a forPostType() payload.
     *
     * @param array<int, array{value: string}> $variables
     *
     * @return list<string>
     */
    private function tokens(array $variables): array
    {
        return array_column($variables, 'value');
    }

    public function test_for_post_type_keeps_support_backed_variables_for_posts(): void
    {
        // The built-in `post` supports excerpt + author + editor and is attached
        // to the `category` taxonomy, so every gated content variable is offered.
        $tokens = $this->tokens(Variables::forPostType('post'));

        $this->assertContains(Variables::EXCERPT, $tokens);
        $this->assertContains(Variables::CONTENT, $tokens);
        $this->assertContains(Variables::AUTHOR, $tokens);
        $this->assertContains(Variables::CATEGORY, $tokens);
    }

    public function test_for_post_type_drops_excerpt_and_category_for_pages(): void
    {
        // A `page` has no excerpt field and no `category` taxonomy, so those tokens
        // must not be offered. Content (editor) and author support remain, so
        // {{content}} still covers a page's description.
        $tokens = $this->tokens(Variables::forPostType('page'));

        $this->assertNotContains(Variables::EXCERPT, $tokens);
        $this->assertNotContains(Variables::CATEGORY, $tokens);
        $this->assertContains(Variables::CONTENT, $tokens);
        $this->assertContains(Variables::AUTHOR, $tokens);

        // Support-independent variables are untouched.
        $this->assertContains(Variables::TITLE, $tokens);
        $this->assertContains(Variables::DATE, $tokens);
    }

    public function test_for_post_type_drops_author_when_unsupported(): void
    {
        register_post_type('kizlo_no_author', [
            'public'   => true,
            'supports' => ['title', 'editor'],
        ]);

        try {
            $tokens = $this->tokens(Variables::forPostType('kizlo_no_author'));

            $this->assertNotContains(Variables::AUTHOR, $tokens);
            $this->assertNotContains(Variables::EXCERPT, $tokens);
            $this->assertNotContains(Variables::CATEGORY, $tokens);
            // Editor support is present, so content is still offered.
            $this->assertContains(Variables::CONTENT, $tokens);
            $this->assertContains(Variables::TITLE, $tokens);
        } finally {
            unregister_post_type('kizlo_no_author');
        }
    }

    public function test_for_post_type_drops_content_without_editor_support(): void
    {
        register_post_type('kizlo_no_editor', [
            'public'   => true,
            'supports' => ['title'],
        ]);

        try {
            $tokens = $this->tokens(Variables::forPostType('kizlo_no_editor'));

            // No editor means no content to summarise.
            $this->assertNotContains(Variables::CONTENT, $tokens);
            $this->assertNotContains(Variables::EXCERPT, $tokens);
            $this->assertContains(Variables::TITLE, $tokens);
        } finally {
            unregister_post_type('kizlo_no_editor');
        }
    }
}
