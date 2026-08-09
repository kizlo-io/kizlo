<?php

namespace Kizlo\Modules\Introspection;

/**
 * Everything the contract has to say about itself, collected rather than thrown.
 *
 * Two severities, and the difference is whether a generated type would be wrong:
 *
 * - `warning` means something was ignored. A keyword nobody recognizes, a
 *   constraint that means nothing on its type, a default that will not serialize.
 *   The declaration loses a constraint; the type it produces is still correct.
 * - `error` means something was excluded. A `$ref` with no target, an inheritance
 *   cycle, an operation with no successful response. There is no honest type to
 *   emit, so the contribution is dropped and said so out loud.
 *
 * Nothing is ever dropped silently, which is the property that matters: a
 * consumer can fail its build on the first `error` and still get every working
 * type in the same response. That is deliberately not this endpoint's decision
 * to make.
 */
class Diagnostics
{
    public const ERROR   = 'error';
    public const WARNING = 'warning';

    /** @var array<int, array<string, mixed>> */
    private array $entries = [];

    /**
     * Location keys are emitted in this order so entries read consistently.
     *
     * @var array<int, string>
     */
    private const LOCATION_KEYS = ['schema_id', 'api_id', 'namespace', 'path', 'operation', 'pointer', 'keyword'];

    /**
     * A contribution had to be dropped. Whatever it described has no type.
     *
     * @param array<string, string> $location
     */
    public function error(array $location, string $message): void
    {
        $this->add(self::ERROR, $location, $message);
    }

    /**
     * Something was ignored. The contract is still complete without it.
     *
     * @param array<string, string> $location
     */
    public function warning(array $location, string $message): void
    {
        $this->add(self::WARNING, $location, $message);
    }

    /**
     * Take an entry that was raised against a different, earlier state.
     *
     * The registry settles which schemas survive over several passes, and a
     * schema's real reason for failing is the one from the pass it died in. By
     * the final pass its parents are gone too, so re-deriving the reason would
     * report a missing parent where the truth was a cycle.
     *
     * @param array<string, string> $entry
     */
    public function adopt(array $entry): void
    {
        $this->entries[] = $entry;
    }

    public function hasErrors(): bool
    {
        foreach ($this->entries as $entry) {
            if ($entry['type'] === self::ERROR) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function all(): array
    {
        return $this->entries;
    }

    /**
     * @param array<string, mixed> $entry
     * @return array<string, string>
     */
    public static function dataOf(array $entry): array
    {
        /** @var array<string, string> $data */
        $data = is_array($entry['data'] ?? null) ? $entry['data'] : [];

        return $data;
    }

    /**
     * Sorted so an unchanged contract produces an unchanged document, and so the
     * things that cost you a type are read before the things that did not.
     *
     * @return array<int, array<string, mixed>>
     */
    public function sorted(): array
    {
        $entries = $this->entries;

        usort($entries, static function (array $a, array $b): int {
            $x = self::dataOf($a);
            $y = self::dataOf($b);

            return [$a['type'] === self::WARNING, $x['schema_id'] ?? '', $x['api_id'] ?? '', $x['path'] ?? '', $x['operation'] ?? '', $x['pointer'] ?? '', $a['message']]
                <=> [$b['type'] === self::WARNING, $y['schema_id'] ?? '', $y['api_id'] ?? '', $y['path'] ?? '', $y['operation'] ?? '', $y['pointer'] ?? '', $b['message']];
        });

        return $entries;
    }

    /**
     * Every entry is `{ type, message, data }`, matching the shape WordPress uses
     * for its own errors. `data` carries whatever locates this particular problem
     * and is deliberately open: a schema entry names a schema, a route entry names
     * a path and an operation, and a future kind of entry can carry something else
     * again without changing the envelope.
     *
     * @param array<string, string> $location
     */
    private function add(string $type, array $location, string $message): void
    {
        $data = [];

        foreach (self::LOCATION_KEYS as $key) {
            if (isset($location[$key]) && $location[$key] !== '') {
                $data[$key] = $location[$key];
            }
        }

        $this->entries[] = ['type' => $type, 'message' => $message, 'data' => $data];
    }
}
