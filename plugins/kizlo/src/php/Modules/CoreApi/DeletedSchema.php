<?php

namespace Kizlo\Modules\CoreApi;

/**
 * What a core delete answers with.
 *
 * Core has two shapes and picks between them at request time.
 * `WP_REST_Posts_Controller::delete_item()` returns `['deleted' => true,
 * 'previous' => ...]` when `force` is set, and the trashed record itself when it
 * is not — so a resource that can be trashed genuinely returns either, and the
 * union is the honest description rather than a hedge. A resource that cannot be
 * trashed refuses a delete without `force` outright, so it only ever reaches the
 * first shape.
 *
 * Whether a post type can be trashed is core's own condition, not a list kept
 * here: `EMPTY_TRASH_DAYS > 0`, narrowed by `MEDIA_TRASH` for attachments, and
 * filterable through `rest_{$post_type}_trashable`. Terms are never trashed at
 * all, because WordPress has no term trash.
 */
final class DeletedSchema
{
    /**
     * The record when it was trashed, or the removal report when it was forced.
     *
     * @return array<string, mixed>
     */
    public static function trashable(string $item): array
    {
        return ['anyOf' => [['$ref' => $item], self::report($item)]];
    }

    /**
     * Only the removal report, because a delete without `force` is refused.
     *
     * @return array<string, mixed>
     */
    public static function permanent(string $item): array
    {
        return self::report($item);
    }

    /**
     * Core's condition for a post type, asked rather than assumed.
     */
    public static function postTypeTrashes(string $postType): bool
    {
        $trashes = EMPTY_TRASH_DAYS > 0;

        if ($postType === 'attachment') {
            $trashes = $trashes && defined('MEDIA_TRASH') && MEDIA_TRASH;
        }

        /** @var bool */
        return apply_filters(sprintf('rest_%s_trashable', $postType), $trashes, null);
    }

    /**
     * @return array<string, mixed>
     */
    private static function report(string $item): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'deleted'  => ['type' => 'boolean', 'required' => true],
                'previous' => ['$ref' => $item, 'required' => true],
            ],
        ];
    }
}
