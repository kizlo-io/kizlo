<?php

namespace Kizlo\Modules\Post;

use Kizlo\Support\Utils;
use Kizlo\Modules\Settings\Taxonomy\TaxonomySettings;
use RuntimeException;
use Throwable;
use WP_Term;

/** Shared wire reader; unknown history must never become an authoritative empty map. */
final class ContentDependencies
{
    public static function exposed(string $taxonomy): bool
    {
        $object = get_taxonomy($taxonomy);
        if (!$object || !Utils::getSettings()->taxonomies->get($taxonomy)->getAccessEnabled()) return false;
        $available = TaxonomySettings::getAvailableObjects();
        return (isset($available[$taxonomy]) && $object->show_in_rest)
            || in_array($taxonomy, apply_filters('kizlo_dependency_taxonomies', []), true);
    }

    public static function affected(int $post_id): ?array
    {
        try {
            self::assertId($post_id);
            $post = get_post($post_id);
            if (!$post instanceof \WP_Post) throw new RuntimeException('Missing dependency resource');
            $direct = [];
            $ancestors = [];
            foreach (get_object_taxonomies($post->post_type) as $taxonomy) {
                if (!self::exposed($taxonomy)) continue;
                $terms = wp_get_object_terms($post_id, $taxonomy);
                if (is_wp_error($terms)) throw new RuntimeException('Term query failed');
                $direct[$taxonomy] = [];
                $ancestors[$taxonomy] = [];
                foreach ($terms as $term) {
                    self::assertId($term->term_id);
                    $direct[$taxonomy][] = $term->term_id;
                    $ancestors[$taxonomy] = array_merge($ancestors[$taxonomy], self::ancestors($term));
                }
                $direct[$taxonomy] = array_values(array_unique($direct[$taxonomy]));
                $ancestors[$taxonomy] = array_values(array_diff(array_unique($ancestors[$taxonomy]), $direct[$taxonomy]));
            }
            return self::merge($direct, $ancestors);
        } catch (Throwable $error) {
            error_log('Kizlo dependency read failed for post ' . $post_id . ': ' . $error->getMessage());
            return null;
        }
    }

    public static function ancestors(WP_Term $term): array
    {
        self::assertId($term->term_id);
        $seen = [$term->term_id];
        $result = [];
        while ($term->parent) {
            self::assertId($term->parent);
            if (in_array($term->parent, $seen, true)) throw new RuntimeException('Taxonomy hierarchy cycle');
            $seen[] = $term->parent;
            $term = get_term($term->parent, $term->taxonomy);
            if (!$term instanceof WP_Term) throw new RuntimeException('Missing taxonomy ancestor');
            $result[] = $term->term_id;
        }
        return $result;
    }

    public static function term(WP_Term $term): ?array
    {
        try {
            return [$term->taxonomy => array_values(array_unique([$term->term_id, ...self::ancestors($term)]))];
        } catch (Throwable $error) {
            error_log('Kizlo dependency read failed for term ' . $term->term_id . ': ' . $error->getMessage());
            return null;
        }
    }

    /** Term changes can alter descendant URLs without changing their post assignments. */
    public static function termChange(WP_Term $term): ?array
    {
        $dependencies = self::term($term);
        if ($dependencies === null) return null;
        try {
            $descendants = get_term_children($term->term_id, $term->taxonomy);
            if (is_wp_error($descendants)) throw new RuntimeException('Descendant query failed');
            foreach ($descendants as $id) self::assertId($id);
            return self::merge($dependencies, [$term->taxonomy => $descendants]);
        } catch (Throwable $error) {
            error_log('Kizlo descendant read failed for term ' . $term->term_id . ': ' . $error->getMessage());
            return null;
        }
    }

    public static function merge(?array $first, ?array $second): ?array
    {
        if ($first === null || $second === null) return null;
        foreach ($second as $taxonomy => $ids) $first[$taxonomy] = array_values(array_unique([...($first[$taxonomy] ?? []), ...$ids]));
        return $first;
    }

    private static function assertId(mixed $id): void
    {
        if (!is_int($id) || $id < 1 || $id > 9007199254740991) throw new RuntimeException('Invalid dependency identity');
    }
}
