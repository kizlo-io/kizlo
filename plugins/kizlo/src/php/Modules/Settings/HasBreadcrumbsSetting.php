<?php

namespace Kizlo\Modules\Settings;

/**
 * Shared `breadcrumbs` setting for content types that carry a breadcrumb trail
 * (post types, taxonomies, authors). Each entry is either a page ID or the
 * reserved '__parent__' token (see SeoBase::BREADCRUMB_PARENT_TOKEN), which the
 * breadcrumb builder expands into the item's real ancestor chain. The rows sit,
 * in order, between the fixed Home crumb and the current item.
 */
trait HasBreadcrumbsSetting
{
    /**
     * Sanitize the breadcrumb middle rows.
     *
     * @param  mixed $value
     * @return list<int|string>
     */
    private function sanitizeBreadcrumbs(mixed $value): array
    {
        if (empty($value) || !is_array($value)) return [];

        $out = [];
        foreach ($value as $item) {
            if ($item === '__parent__') {
                $out[] = '__parent__';
                continue;
            }

            $id = absint($item);
            if ($id > 0) $out[] = $id;
        }

        return $out;
    }

    /**
     * Ordered breadcrumb middle rows: page IDs and/or the '__parent__' token.
     *
     * @return list<int|string>
     */
    public function getBreadcrumbs(): array
    {
        return $this->get('breadcrumbs') ?? [];
    }
}
