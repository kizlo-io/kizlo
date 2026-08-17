<?php

namespace Kizlo\Modules\Extension;

/**
 * One entry of a `Kizlo Requires` header, resolved against what is running.
 *
 * An entry is a slug and the oldest version of it that will do:
 *
 *     Kizlo Requires: kizlo 0.12.0, woocommerce 9.0
 *
 * An entry that cannot be read is kept rather than dropped. A typo in a
 * requirement is the same class of mistake as the missing requirement it was
 * meant to express, and silently ignoring it puts the extension back where it
 * started.
 */
final class Requirement
{
    private function __construct(
        /** The entry as written, for reporting one that could not be read. */
        public readonly string $raw,
        public readonly ?string $slug,
        public readonly ?string $required,
        /** Display name of the active plugin behind the slug, null when nothing is. */
        public readonly ?string $name,
        /** Version of the active plugin behind the slug, null when nothing is. */
        public readonly ?string $installed,
    ) {}

    public static function parse(string $entry): self
    {
        $entry = trim($entry);

        if (preg_match('/^(?<slug>[a-z0-9][a-z0-9._-]*)\s+(?<version>[0-9][^\s]*)$/i', $entry, $matches) !== 1) {
            return new self($entry, null, null, null, null);
        }

        $plugin = Plugins::find($matches['slug']);

        return new self($entry, $matches['slug'], $matches['version'], $plugin['name'] ?? null, $plugin['version'] ?? null);
    }

    public function isMet(): bool
    {
        if ($this->required === null || $this->installed === null) return false;

        return version_compare($this->installed, $this->required, '>=');
    }

    /**
     * One line naming the component and the version, for the admin notice.
     */
    public function describe(): string
    {
        if ($this->slug === null || $this->required === null) {
            return sprintf('“%s” is not a requirement Kizlo can read. Expected a slug and a version, e.g. “kizlo 0.12.0”.', $this->raw);
        }

        if ($this->installed === null) {
            return sprintf('%s is not active. Version %s or newer is required.', $this->name ?? $this->slug, $this->required);
        }

        return sprintf('%s %s is active. Version %s or newer is required.', $this->name ?? $this->slug, $this->installed, $this->required);
    }
}
