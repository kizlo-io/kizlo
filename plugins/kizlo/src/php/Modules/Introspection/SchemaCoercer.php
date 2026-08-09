<?php

namespace Kizlo\Modules\Introspection;

/**
 * Repairs declarations whose intent is unambiguous.
 *
 * `'title' => 23` is a typo, not a broken contract. Failing the whole document
 * over it would stop type generation for every route on the install because
 * someone quoted a number wrongly in one description — a build-wide outage for a
 * mistake with no runtime consequence at all. So a value that can only have meant
 * one thing is corrected here and the contract carries on.
 *
 * "Unambiguous" is the whole rule, and it is deliberately narrow:
 *
 * - `23` as a title can only have meant `"23"`.
 * - `'5'` as a minimum can only have meant `5`.
 * - `1` as a required flag can only have meant `true`.
 * - `'yes'` as a required flag could have meant anything, so it is left alone and
 *   {@see ArgTranslator::criticalErrors()} refuses to register the route. Guessing
 *   here would decide whether a field is enforced, and guessing wrong on
 *   `'required' => 'no'` would enforce the opposite of what was written.
 *
 * Nothing that carries meaning is touched: `type` is never guessed, and `enum` and
 * `default` are data rather than metadata, so a wrong one stays wrong and gets
 * reported.
 */
class SchemaCoercer
{
    /** Prose. Any number or string can stand in for the string that was meant. */
    private const STRING_KEYWORDS = ['title', 'description', 'format', 'pattern'];

    /** Counts and lengths. A numeric value with no fractional part is that integer. */
    private const INTEGER_KEYWORDS = ['minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties'];

    /** Bounds. Any numeric value is that number. */
    private const NUMBER_KEYWORDS = ['minimum', 'maximum', 'multipleOf'];

    /** Flags. */
    private const BOOLEAN_KEYWORDS = ['required', 'nullable', 'deprecated', 'uniqueItems', 'exclusiveMinimum', 'exclusiveMaximum'];

    /**
     * The spellings of true and false that can only have meant one thing.
     *
     * Matched literally, never cast. `(bool) 'no'` is `true` in PHP, so a cast
     * here would silently enforce the opposite of what was written — the map is
     * what makes these safe, and it is closed on purpose.
     *
     * @var array<string, bool>
     */
    private const BOOLEAN_WORDS = ['yes' => true, 'no' => false, 'true' => true, 'false' => false];

    /**
     * @param array<array-key, mixed> $schema
     * @return array<array-key, mixed>
     */
    public static function coerce(array $schema): array
    {
        $coerced = [];

        foreach ($schema as $keyword => $value) {
            if (!is_string($keyword)) {
                $coerced[$keyword] = $value;
                continue;
            }

            $keyword = self::canonicalKeyword($keyword);

            $coerced[$keyword] = self::coerceKeyword($keyword, $value);
        }

        return $coerced;
    }

    /**
     * Fix a keyword's casing. `minlength` can only have meant `minLength`.
     *
     * Only keyword names are repaired, never property names: those are real API
     * field names where case is part of the contract. Every keyword stays unique
     * when lowercased, so nothing here is a guess.
     *
     * A keyword that is merely unrecognized is left alone rather than invented.
     * `allof` becomes `allOf` and is then reported, because `allOf` genuinely is
     * not supported and `$extends` is not a silent substitute for it.
     */
    private static function canonicalKeyword(string $keyword): string
    {
        static $byLowercase = null;

        if ($byLowercase === null) {
            $byLowercase = [];
            foreach (array_merge(Spec::allKeywords(), ['allOf', 'not']) as $known) {
                $byLowercase[strtolower($known)] = $known;
            }
        }

        return $byLowercase[strtolower($keyword)] ?? $keyword;
    }

    private static function coerceKeyword(string $keyword, mixed $value): mixed
    {
        if (is_array($value)) {
            return self::coerceChildren($keyword, $value);
        }

        return match (true) {
            in_array($keyword, self::STRING_KEYWORDS, true)  => self::toString($value),
            in_array($keyword, self::INTEGER_KEYWORDS, true) => self::toInteger($value),
            in_array($keyword, self::NUMBER_KEYWORDS, true)  => self::toNumber($value),
            in_array($keyword, self::BOOLEAN_KEYWORDS, true) => self::toBoolean($value),
            default                                          => $value,
        };
    }

    /**
     * Recurse into nested schemas only. `enum` and `default` hold values the
     * contract describes rather than metadata about them, so they pass through.
     *
     * @param array<array-key, mixed> $value
     * @return array<array-key, mixed>
     */
    private static function coerceChildren(string $keyword, array $value): array
    {
        return match ($keyword) {
            'properties', 'patternProperties', 'anyOf', 'oneOf' => array_map(
                static fn(mixed $child): mixed => is_array($child) ? self::coerce($child) : $child,
                $value,
            ),
            'items', 'additionalProperties' => self::coerce($value),
            default                         => $value,
        };
    }

    private static function toString(mixed $value): mixed
    {
        return is_int($value) || is_float($value) ? (string) $value : $value;
    }

    private static function toInteger(mixed $value): mixed
    {
        if (is_bool($value) || !is_numeric($value)) {
            return $value;
        }

        $number = $value + 0;

        return is_int($number) || $number == (int) $number ? (int) $number : $value;
    }

    private static function toNumber(mixed $value): mixed
    {
        if (is_bool($value) || !is_numeric($value)) {
            return $value;
        }

        return $value + 0;
    }

    private static function toBoolean(mixed $value): mixed
    {
        if (is_string($value) && isset(self::BOOLEAN_WORDS[strtolower(trim($value))])) {
            return self::BOOLEAN_WORDS[strtolower(trim($value))];
        }

        return match (true) {
            $value === 1, $value === 1.0, $value === '1' => true,
            $value === 0, $value === 0.0, $value === '0' => false,
            default                                      => $value,
        };
    }
}
