<?php

namespace Kizlo\Modules\Post;

use WP_Post;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\Support\Utils;
use Kizlo\Modules\CustomFields\CustomFieldsStore;

class PostExtension
{
    public function register(): void
    {
        if (!did_action('rest_api_init')) {
            add_action('rest_api_init', [$this, 'bind'], PHP_INT_MAX);

            return;
        }

        $this->bind();
    }

    public function bind(): void
    {
        foreach (array_keys(Utils::getSettings()->postTypes->all()) as $post_type) {
            add_filter("rest_prepare_{$post_type}", [$this, 'prepare'], PHP_INT_MAX, 3);
        }
    }

    public function prepare(WP_REST_Response $response, WP_Post $post, WP_REST_Request $request): WP_REST_Response
    {
        $data = $request->get_param('id')
            ? $this->extendSingle($response->get_data(), $post)
            : $this->extendListItem($response->get_data(), $post);

        $definitions = Utils::getSettings()->postTypes->get($post->post_type)->getCustomFields();
        $custom      = CustomFieldsStore::read(CustomFieldsStore::META_POST, $post->ID, $definitions);

        // Let an integration merge its namespaced sub-object (e.g. `custom.acf`).
        // Paired with `kizlo_post_type_custom_schema` so the emitted namespace is
        // the one the schema declares. No listener leaves the values untouched.
        $custom = apply_filters('kizlo_post_type_custom_values', $custom, $post);

        $data['kizlo']['custom'] = (object) $custom;

        $response->set_data($data);

        return $response;
    }

    public function extendSingle(array $data, WP_Post $post): array
    {
        $settings = Utils::getSettings();
        $kizlo    = kizlo_apply_extend_filter('post', $post);

        if ($settings->postTypes->get($post->post_type)->getSeoEnabled()) {
            $post_seo = new PostSchema($settings);
            $kizlo = ['seo' => [
                'head'  => $post_seo->buildMeta($post),
                'schema' => $post_seo->jsonLd($post),
            ]] + $kizlo;
        }

        $data['kizlo'] = $kizlo;

        return $data;
    }

    public function extendListItem(array $data, WP_Post $post): array
    {
        $data['kizlo'] = kizlo_apply_extend_filter('post_list_item', $post);

        return $data;
    }
}
