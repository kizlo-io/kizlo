<?php

namespace Kizlo\Tests\Registration;

use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\Modules\Settings\Taxonomy\TaxonomySettings;
use Kizlo\Tests\TestCase;
use WP_REST_Request;

class CustomFieldSettingsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsAdmin();
    }

    /** @dataProvider settingsRoutes */
    public function test_complete_ui_payload_saves_every_field_type(string $kind, string $slug): void
    {
        $response = $this->put($kind, $slug, $this->payload($kind, $this->allFieldTypes()));

        $this->assertSame(200, $response->get_status(), wp_json_encode($response->get_data()));
        $stored = $response->get_data()['custom_fields'];
        $this->assertCount(14, $stored);
        $this->assertSame("First line\nSecond line", $stored[1]['default']);
        $this->assertNull($stored[3]['default']);
        $this->assertFalse($stored[4]['default']);
        $this->assertNull($stored[5]['default']);
        $this->assertSame([], $stored[6]['default']);
        $this->assertFalse($stored[12]['fields'][0]['default']);
        $this->assertNull($stored[13]['min']);
        $this->assertNull($stored[13]['max']);
        $this->assertNull($stored[13]['fields'][0]['default']);
    }

    /** @dataProvider settingsRoutes */
    public function test_saved_select_and_multiselect_can_transition_with_complete_shapes(string $kind, string $slug): void
    {
        $select = $this->field('choice', 'select', [
            'choices' => [['value' => 'one', 'label' => 'One']],
            'default' => null,
        ]);
        $first = $this->put($kind, $slug, $this->payload($kind, [$select]));
        $this->assertSame(200, $first->get_status());

        $multi = array_merge($select, ['type' => 'multiselect', 'default' => []]);
        $second = $this->put($kind, $slug, $this->payload($kind, [$multi]));
        $this->assertSame(200, $second->get_status(), wp_json_encode($second->get_data()));
        $this->assertSame('multiselect', $second->get_data()['custom_fields'][0]['type']);
        $this->assertSame([], $second->get_data()['custom_fields'][0]['default']);

        $selectAgain = array_merge($multi, ['type' => 'select', 'default' => null]);
        $third = $this->put($kind, $slug, $this->payload($kind, [$selectAgain]));
        $this->assertSame(200, $third->get_status(), wp_json_encode($third->get_data()));
        $this->assertSame('select', $third->get_data()['custom_fields'][0]['type']);
        $this->assertNull($third->get_data()['custom_fields'][0]['default']);
    }

    /** @dataProvider settingsRoutes */
    public function test_required_multiselect_needs_choices_but_not_a_default(string $kind, string $slug): void
    {
        $requiredMulti = fn(string $name): array => $this->field($name, 'multiselect', [
            'required' => true,
            'choices'  => [['value' => 'a', 'label' => 'Alpha']],
            'default'  => [],
        ]);
        $fields = [
            $requiredMulti('multi_top'),
            $this->field('multi_group', 'group', [
                'fields' => [$requiredMulti('choice')],
            ]),
            $this->field('multi_repeater', 'repeater', [
                'fields' => [$requiredMulti('choice')],
                'min'    => null,
                'max'    => null,
            ]),
        ];

        $response = $this->put($kind, $slug, $this->payload($kind, $fields));

        $this->assertSame(200, $response->get_status(), wp_json_encode($response->get_data()));
        $this->assertSame([], $response->get_data()['custom_fields'][0]['default']);
        $this->assertSame([], $response->get_data()['custom_fields'][1]['fields'][0]['default']);
        $this->assertSame([], $response->get_data()['custom_fields'][2]['fields'][0]['default']);
    }

    /** @dataProvider settingsRoutes */
    public function test_reordering_a_nested_tree_preserves_field_identities_names_and_values(string $kind, string $slug): void
    {
        $group = $this->field('group', 'group', [
            'fields' => [
                $this->field('group_text', 'text', ['default' => 'group value']),
                $this->field('group_rows', 'repeater', [
                    'fields' => [$this->field('group_deep', 'text', ['default' => 'group deep value'])],
                    'min'    => null,
                    'max'    => null,
                ]),
            ],
        ]);
        $repeater = $this->field('repeater', 'repeater', [
            'fields' => [
                $this->field('repeater_text', 'text', ['default' => 'repeater value']),
                $this->field('repeater_group', 'group', [
                    'fields' => [$this->field('repeater_deep', 'text', ['default' => 'repeater deep value'])],
                ]),
            ],
            'min'    => null,
            'max'    => null,
        ]);
        $other = $this->field('other', 'text', ['default' => 'other value']);
        $first = $this->put($kind, $slug, $this->payload($kind, [$group, $repeater, $other]));
        $this->assertSame(200, $first->get_status(), wp_json_encode($first->get_data()));

        $stored                 = $first->get_data()['custom_fields'];
        $top_names              = array_reverse(array_column($stored, 'name'));
        $repeater_child_names   = array_reverse(array_column($stored[1]['fields'], 'name'));
        $group_child_names      = array_reverse(array_column($stored[0]['fields'], 'name'));
        $stored[0]['fields']    = array_reverse($stored[0]['fields']);
        $stored[1]['fields']    = array_reverse($stored[1]['fields']);
        $reordered              = [$stored[2], $stored[1], $stored[0]];
        $second                 = $this->put($kind, $slug, $this->payload($kind, $reordered));
        $saved                  = $second->get_data()['custom_fields'];

        $this->assertSame(200, $second->get_status(), wp_json_encode($second->get_data()));
        $this->assertSame($top_names, array_column($saved, 'name'));
        $this->assertSame($repeater_child_names, array_column($saved[1]['fields'], 'name'));
        $this->assertSame($group_child_names, array_column($saved[2]['fields'], 'name'));
        $this->assertSame('repeater_deep', $saved[1]['fields'][0]['fields'][0]['name']);
        $this->assertSame('repeater deep value', $saved[1]['fields'][0]['fields'][0]['default']);
        $this->assertSame('group_deep', $saved[2]['fields'][0]['fields'][0]['name']);
        $this->assertSame('group deep value', $saved[2]['fields'][0]['fields'][0]['default']);
        $this->assertSame($saved, $this->loadFields($kind, $slug));
    }

    /** @dataProvider settingsRoutes */
    public function test_invalid_mixed_batch_is_rejected_without_replacing_saved_fields(string $kind, string $slug): void
    {
        $original = [$this->field('original', 'text', ['default' => 'kept'])];
        $saved = $this->put($kind, $slug, $this->payload($kind, $original));
        $this->assertSame(200, $saved->get_status());

        $invalid = [
            $this->field('profile_name', 'text', ['default' => null]),
            $this->field('profile', 'group', [
                'fields' => [$this->field('name', 'text', ['default' => null])],
            ]),
        ];
        $failed = $this->put($kind, $slug, $this->payload($kind, $invalid));

        $this->assertSame(400, $failed->get_status());
        $this->assertStringContainsString('storage path', $failed->get_data()['message']);
        $this->assertSame($saved->get_data()['custom_fields'], $this->loadFields($kind, $slug));
    }

    public static function settingsRoutes(): array
    {
        return [
            'post type' => ['post_types', 'post'],
            'taxonomy'  => ['taxonomies', 'category'],
        ];
    }

    private function put(string $kind, string $slug, array $body): \WP_REST_Response
    {
        $request = new WP_REST_Request('PUT', "/kizlo/v1/settings/{$kind}/{$slug}");
        $request->set_header('Content-Type', 'application/json');
        $request->set_body(wp_json_encode($body));

        return rest_get_server()->dispatch($request);
    }

    private function payload(string $kind, array $fields): array
    {
        $base = [
            'pathname_structure'       => "/{$kind}/{{slug}}",
            'title_structure'          => '{{title}}',
            'description_structure'    => "First line\nSecond line",
            'search_engine_visibility' => true,
            'seo_enabled'              => true,
            'rest_api_enabled'         => true,
            'breadcrumbs'              => [],
            'custom_fields'            => $fields,
        ];

        if ($kind === 'post_types') {
            $base['webpage_type']             = 'WebPage';
            $base['article_type']             = 'Article';
            $base['comment_action_structure'] = null;
        }

        return $base;
    }

    private function allFieldTypes(): array
    {
        return [
            $this->field('text_value', 'text', ['default' => null]),
            $this->field('textarea_value', 'textarea', ['default' => "First line\nSecond line"]),
            $this->field('richtext_value', 'richtext', ['default' => null]),
            $this->field('number_value', 'number', ['default' => null, 'min' => null, 'max' => null, 'step' => null]),
            $this->field('toggle_value', 'toggle', ['default' => false]),
            $this->field('select_value', 'select', [
                'choices' => [['value' => 'one', 'label' => 'One']],
                'default' => null,
            ]),
            $this->field('multi_value', 'multiselect', [
                'choices' => [['value' => 'one', 'label' => 'One']],
                'default' => [],
            ]),
            $this->field('url_value', 'url', ['default' => null]),
            $this->field('email_value', 'email', ['default' => null]),
            $this->field('date_value', 'date', ['default' => null]),
            $this->field('image_value', 'image'),
            $this->field('file_value', 'file'),
            $this->field('group_value', 'group', [
                'fields' => [$this->field('enabled', 'toggle', ['default' => false])],
            ]),
            $this->field('repeater_value', 'repeater', [
                'fields' => [$this->field('amount', 'number', [
                    'default' => null,
                    'min'     => null,
                    'max'     => null,
                    'step'    => null,
                ])],
                'min' => null,
                'max' => null,
            ]),
        ];
    }

    private function field(string $name, string $type, array $config = []): array
    {
        return array_merge([
            'name'         => $name,
            'label'        => ucwords(str_replace('_', ' ', $name)),
            'instructions' => '',
            'required'     => false,
            'type'         => $type,
        ], $config);
    }

    private function loadFields(string $kind, string $slug): array
    {
        if ($kind === 'post_types') {
            return PostTypeSettings::load($slug)->getCustomFields();
        }

        return TaxonomySettings::load($slug)->getCustomFields();
    }
}
