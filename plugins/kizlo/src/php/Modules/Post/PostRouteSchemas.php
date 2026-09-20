<?php

namespace Kizlo\Modules\Post;

use WP_REST_Controller;
use Kizlo\Support\Utils;
use Kizlo\Modules\Introspection\CoreSchemas;
use Kizlo\Modules\Introspection\CustomFieldSchema;

/** Describes the Kizlo envelope added to included WordPress post-type routes. */
final class PostRouteSchemas
{
    /**
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    public static function contribute(
        array $properties,
        string $apiId,
        WP_REST_Controller $controller,
        string $operation,
        string $path,
    ): array {
        foreach (Utils::getSettings()->postTypes->all() as $slug => $settings) {
            $postType = get_post_type_object($slug);

            if (!$postType || $postType->get_rest_controller() !== $controller) {
                continue;
            }

            $custom               = CustomFieldSchema::responseGroup($settings->getCustomFields());
            $custom['properties'] = apply_filters('kizlo_post_type_custom_schema', $custom['properties'], $slug);

            $envelope = [
                'custom' => $custom,
                'extend' => [
                    'type'                 => 'object',
                    'required'             => true,
                    'additionalProperties' => true,
                    'description'          => 'Whatever the Kizlo post extension filters contributed.',
                ],
            ];

            if (str_contains($path, '{id}') && $settings->getSeoEnabled()) {
                $envelope = ['seo' => ['$ref' => CoreSchemas::SEO, 'required' => true]] + $envelope;
            }

            $properties['kizlo'] = [
                'type'       => 'object',
                'required'   => true,
                'properties' => $envelope,
            ];

            return $properties;
        }

        return $properties;
    }
}
