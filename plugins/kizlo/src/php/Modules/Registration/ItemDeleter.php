<?php

namespace Kizlo\Modules\Registration;

use InvalidArgumentException;
use WP_Error;

/**
 * Resumable, batched permanent deletion of an object's items.
 *
 * Job state persists in a single option keyed by object key, so deletion
 * survives across requests: the admin UI polls {@see processBatch()} until the
 * job completes and can {@see retry()} the failures. Post types delete their
 * posts; taxonomies delete only their terms, meta, and relationships — never
 * posts. The item list is captured up front so the taxonomy stays registered
 * while its terms are deleted; the caller removes the definition afterward.
 */
class ItemDeleter
{
    private const OPTION = 'kizlo_registration_deletions';

    private const BATCH_SIZE = 25;

    public const KIND_POST_TYPE = 'post_type';

    public const KIND_TAXONOMY = 'taxonomy';

    /**
     * Capture every item and begin a deletion job.
     *
     * @return array<string, mixed> Progress snapshot.
     */
    public static function start(string $slug, string $kind): array
    {
        $ids = $kind === self::KIND_TAXONOMY ? self::termIds($slug) : self::postIds($slug);

        $job = [
            'slug'    => $slug,
            'kind'    => $kind,
            'queue'   => array_values($ids),
            'failed'  => [],
            'total'   => count($ids),
            'deleted' => 0,
            'status'  => $ids === [] ? 'complete' : 'processing',
        ];

        self::save($slug, $job);

        return self::progress($job);
    }

    /**
     * Delete the next batch and report progress.
     *
     * @return array<string, mixed>
     * @throws InvalidArgumentException When no job is in progress for the slug.
     */
    public static function processBatch(string $slug, int $size = self::BATCH_SIZE): array
    {
        $job = self::get($slug);

        if ($job === null) {
            throw new InvalidArgumentException("No deletion is in progress for \"{$slug}\".");
        }

        $batch = array_splice($job['queue'], 0, max(1, $size));

        foreach ($batch as $id) {
            if (self::deleteItem($job['kind'], $slug, (int) $id)) {
                $job['deleted']++;
            } else {
                $job['failed'][] = (int) $id;
            }
        }

        if ($job['queue'] === []) {
            $job['status'] = $job['failed'] === [] ? 'complete' : 'failed';
        }

        self::save($slug, $job);

        return self::progress($job);
    }

    /**
     * Requeue failed ids for another pass.
     *
     * @return array<string, mixed>
     * @throws InvalidArgumentException When no job is in progress for the slug.
     */
    public static function retry(string $slug): array
    {
        $job = self::get($slug);

        if ($job === null) {
            throw new InvalidArgumentException("No deletion is in progress for \"{$slug}\".");
        }

        $job['queue']  = array_values(array_unique(array_merge($job['queue'], $job['failed'])));
        $job['failed'] = [];
        $job['status'] = $job['queue'] === [] ? 'complete' : 'processing';

        self::save($slug, $job);

        return self::progress($job);
    }

    public static function isComplete(string $slug): bool
    {
        $job = self::get($slug);

        return $job !== null && $job['status'] === 'complete';
    }

    /**
     * Remove the job record once the caller has finished with it.
     */
    public static function clear(string $slug): void
    {
        $all = self::allJobs();

        if (array_key_exists($slug, $all)) {
            unset($all[$slug]);
            update_option(self::OPTION, $all);
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function get(string $slug): ?array
    {
        $job = self::allJobs()[$slug] ?? null;

        return is_array($job) ? $job : null;
    }

    /**
     * @param array<string, mixed> $job
     * @return array<string, mixed>
     */
    private static function progress(array $job): array
    {
        return [
            'slug'      => $job['slug'],
            'kind'      => $job['kind'],
            'total'     => (int) $job['total'],
            'deleted'   => (int) $job['deleted'],
            'failed'    => count($job['failed']),
            'remaining' => count($job['queue']),
            'status'    => $job['status'],
            'complete'  => $job['status'] === 'complete',
        ];
    }

    private static function deleteItem(string $kind, string $slug, int $id): bool
    {
        if ($kind === self::KIND_TAXONOMY) {
            $result = wp_delete_term($id, $slug);

            return $result === true;
        }

        return wp_delete_post($id, true) instanceof \WP_Post;
    }

    /**
     * @return int[]
     */
    private static function postIds(string $slug): array
    {
        return array_map('intval', get_posts([
            'post_type'      => $slug,
            'post_status'    => 'any',
            'posts_per_page' => -1,
            'fields'         => 'ids',
            'no_found_rows'  => true,
        ]));
    }

    /**
     * @return int[]
     */
    private static function termIds(string $slug): array
    {
        $terms = get_terms([
            'taxonomy'   => $slug,
            'hide_empty' => false,
            'fields'     => 'ids',
        ]);

        return $terms instanceof WP_Error ? [] : array_map('intval', $terms);
    }

    /**
     * @param array<string, mixed> $job
     */
    private static function save(string $slug, array $job): void
    {
        $all        = self::allJobs();
        $all[$slug] = $job;

        update_option(self::OPTION, $all);
    }

    /**
     * @return array<string, mixed>
     */
    private static function allJobs(): array
    {
        $all = get_option(self::OPTION, []);

        return is_array($all) ? $all : [];
    }
}
