<?php

namespace Kizlo\Modules\Settings;

use Kizlo\Support\DataAbstract;

/**
 * Base class for settings stored as indexed entries under a single WordPress option.
 *
 * Each entry is keyed by a slug/id (e.g. post type slug, taxonomy slug).
 * Child classes must define OPTION_KEY.
 * Use load($id) to retrieve and save($id) to persist a specific entry.
 *
 * @since 1.0.0
 */
abstract class SettingsIndexedAbstract extends DataAbstract
{
    /**
     * WordPress option key.
     * Must be defined in each child class.
     *
     * @var string
     */
    protected const OPTION_KEY = '';

    /**
     * Load a single entry by id from the option.
     *
     * @param  string $id Entry key (e.g. post type slug).
     * @return static
     */
    public static function load(string $id): static
    {
        $all  = get_option(static::OPTION_KEY, []);
        $data = $all[$id] ?? [];

        // @phpstan-ignore new.static
        return new static($data);
    }

    /**
     * Persist a single entry by id into the option.
     *
     * @param  string $id Entry key (e.g. post type slug).
     * @return bool True if updated, false if unchanged or failed.
     */
    public function save(string $id): bool
    {
        $all      = get_option(static::OPTION_KEY, []);
        $all[$id] = $this->getData();

        $result = update_option(static::OPTION_KEY, $all);
        if ($result) SettingsCache::invalidate();

        return $result;
    }
}
