<?php

namespace Kizlo\Tests\Introspection;

use Kizlo\Modules\Introspection\Diagnostics;
use Kizlo\Modules\Introspection\RouteErrors;
use WP_REST_Server;

class RouteErrorsTest extends IntrospectionTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->seedSettings();
        $this->actingAsAdmin();
        $this->boot();
    }

    public function test_errors_can_be_added_without_redeclaring_the_route_spec(): void
    {
        kizlo_register_route_errors(
            [
                'namespace' => 'wp/v2',
                'path'      => '/posts/{id}',
                'method'    => 'GET',
            ],
            ['acme_post_unavailable'],
        );

        $operation = $this->document()['apis']['posts']['paths']['/posts/{id}']['retrieve'];

        $this->assertContains('acme_post_unavailable', $operation['errors']);
        $this->assertArrayHasKey('input', $operation);
        $this->assertArrayHasKey('responses', $operation);
        $this->assertNotContains(
            'acme_post_unavailable',
            $this->document()['apis']['posts']['paths']['/posts/{id}']['update']['errors'],
        );
    }

    public function test_multiple_registrations_for_one_route_compose(): void
    {
        $route = [
            'namespace' => 'wp/v2',
            'path'      => '/posts/{id}',
            'method'    => 'GET',
        ];

        kizlo_register_route_errors($route, ['acme_first']);
        kizlo_register_route_errors($route, ['acme_second']);

        $errors = $this->document()['apis']['posts']['paths']['/posts/{id}']['retrieve']['errors'];

        $this->assertContains('acme_first', $errors);
        $this->assertContains('acme_second', $errors);
    }

    public function test_the_collection_filter_uses_the_same_entry_shape(): void
    {
        $contribute = static function (array $entries): array {
            $entries[] = [
                'route' => [
                    'namespace' => 'wp/v2',
                    'path'      => '/posts/{id}',
                    'method'    => 'GET',
                ],
                'errors' => ['acme_filtered'],
            ];

            return $entries;
        };

        add_filter(RouteErrors::FILTER, $contribute);

        try {
            $errors = $this->document()['apis']['posts']['paths']['/posts/{id}']['retrieve']['errors'];
            $this->assertContains('acme_filtered', $errors);
        } finally {
            remove_filter(RouteErrors::FILTER, $contribute);
        }
    }

    public function test_malformed_duplicate_and_unmatched_registrations_are_reported(): void
    {
        kizlo_register_route_errors(
            ['namespace' => 'wp/v2', 'path' => '/posts/{id}', 'method' => 'GET'],
            ['acme_duplicate', 'acme_duplicate'],
        );
        kizlo_register_route_errors(
            ['namespace' => 'wp/v2', 'path' => '/missing', 'method' => 'GET'],
            ['acme_missing'],
        );
        kizlo_register_route_errors(
            ['namespace' => 'not-a-namespace', 'path' => 'missing-slash', 'method' => 'EVERYTHING'],
            ['acme_invalid'],
        );
        kizlo_register_route_errors(
            ['namespace' => 'wp/v2', 'path' => '/posts', 'method' => 'GET'],
            [''],
        );

        $errors = $this->errors();

        $this->assertErrorContains($errors, 'registered more than once');
        $this->assertErrorContains($errors, 'No introspected route matches');
        $this->assertErrorContains($errors, 'requires a valid');
        $this->assertErrorContains($errors, 'must be a non-empty string');
    }

    public function test_placeholder_name_must_match_the_registered_capture(): void
    {
        kizlo_register_route_errors(
            ['namespace' => 'wp/v2', 'path' => '/posts/{post_id}', 'method' => 'GET'],
            ['acme_wrong_parameter'],
        );

        $document = $this->document();
        $operation = $document['apis']['posts']['paths']['/posts/{id}']['retrieve'];

        $this->assertNotContains('acme_wrong_parameter', $operation['errors']);
        $this->assertErrorContains($document['diagnostics'], 'No introspected route matches');
    }

    public function test_raw_regex_and_repeated_placeholders_are_not_readable_selectors(): void
    {
        kizlo_register_route_errors(
            ['namespace' => 'wp/v2', 'path' => '/posts/(?P<id>[\d]+)', 'method' => 'GET'],
            ['acme_raw_regex'],
        );
        kizlo_register_route_errors(
            ['namespace' => 'wp/v2', 'path' => '/posts/{id}/{id}', 'method' => 'GET'],
            ['acme_repeated_parameter'],
        );

        $document = $this->document();
        $operation = $document['apis']['posts']['paths']['/posts/{id}']['retrieve'];

        $this->assertNotContains('acme_raw_regex', $operation['errors']);
        $this->assertNotContains('acme_repeated_parameter', $operation['errors']);
        $this->assertGreaterThanOrEqual(2, count(array_filter(
            $document['diagnostics'],
            static fn(array $error): bool => str_contains($error['message'], 'requires a valid'),
        )));
    }

    public function test_ambiguous_readable_path_does_not_annotate_either_declaration(): void
    {
        $contribute = static function (array $entries): array {
            $entries[] = [
                'route' => ['namespace' => 'acme/v1', 'path' => '/things/{id}', 'method' => 'GET'],
                'errors' => ['acme_ambiguous'],
            ];

            return $entries;
        };

        add_filter(RouteErrors::FILTER, $contribute);

        try {
            $declarations = [
                ['declaration' => ['namespace' => 'acme/v1', 'route' => '/things/(?P<id>[\d]+)', 'method' => 'GET'], 'core' => false],
                ['declaration' => ['namespace' => 'acme/v1', 'route' => '/things/(?P<id>[a-z]+)', 'method' => 'GET'], 'core' => false],
            ];
            $diagnostics = new Diagnostics();
            $result = RouteErrors::apply($declarations, $diagnostics);

            $this->assertArrayNotHasKey('errors', $result[0]['declaration']);
            $this->assertArrayNotHasKey('errors', $result[1]['declaration']);
            $this->assertErrorContains($diagnostics->all(), 'More than one introspected route matches');
        } finally {
            remove_filter(RouteErrors::FILTER, $contribute);
        }
    }

    private function boot(): void
    {
        global $wp_rest_server;

        $wp_rest_server = new WP_REST_Server();

        do_action('rest_api_init', $wp_rest_server);
    }
}
