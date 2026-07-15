<?php

namespace Kizlo\Modules\Settings;

use Kizlo\Modules\Webhook\Webhook;
use InvalidArgumentException;
use Kizlo\Support\DataAbstract;

/**
 * Base class for settings stored as a single WordPress option.
 *
 * Child classes must define OPTION_KEY.
 * Use load() to retrieve and save() to persist.
 *
 * @since 1.0.0
 */
abstract class SettingsAbstract extends DataAbstract
{
    /**
     * WordPress option key.
     * Must be defined in each child class.
     *
     * @var string
     */
    protected const OPTION_KEY = '';

    /**
     * Load settings from WordPress options.
     *
     * @return static
     */
    public static function load(): static
    {
        $data = get_option(static::OPTION_KEY, []);

        // @phpstan-ignore new.static
        return new static($data);
    }

    /**
     * Persist settings to WordPress options.
     *
     * @return bool True if updated, false if unchanged or failed.
     */
    public function save(): bool
    {
        $result = update_option(static::OPTION_KEY, $this->data);
        if ($result) SettingsCache::invalidate();

        Webhook::sendEvent(Webhook::SETTINGS_SAVED_EVENT);

        Webhook::sendEvent('data.saved', ['data' => 'test']);

        return $result;
    }

    /**
     * Assert value is a valid media item with a numeric id.
     *
     * @param  mixed $value
     * @throws InvalidArgumentException
     */
    protected function assertValidMediaId(string $key, mixed $value): void
    {
        if (empty($value)) return;

        if (!is_numeric($value)) {
            throw new InvalidArgumentException("{$key} must be a valid attachment ID.");
        }
    }

    /**
     * Assert that a value is either a valid URL or empty.
     *
     * @param  string $key   Field name used in the exception message.
     * @param  mixed  $value
     * @throws InvalidArgumentException
     */
    protected function assertValidUrl(string $key, mixed $value): void
    {
        if (!empty($value) && !filter_var($value, FILTER_VALIDATE_URL)) {
            throw new InvalidArgumentException("{$key} must be a valid URL.");
        }
    }

    /**
     * Assert that a value is either a valid hex color (3/6 digit, `#` prefixed)
     * or empty.
     *
     * @param  string $key   Field name used in the exception message.
     * @param  mixed  $value
     * @throws InvalidArgumentException
     */
    protected function assertValidHexColor(string $key, mixed $value): void
    {
        if (empty($value)) return;

        if (!is_string($value) || sanitize_hex_color($value) === null) {
            throw new InvalidArgumentException("{$key} must be a valid hex color.");
        }
    }
}
