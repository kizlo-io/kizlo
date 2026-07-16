<?php

namespace Kizlo\Support;

/**
 * Abstract base class for domain data objects using a property bag pattern.
 *
 * Child classes define their shape by declaring $data with default values.
 * External input goes through fill() → validate() → sanitize() → store.
 * Direct hydration (load from storage) bypasses validation/sanitization.
 *
 * @since 1.0.0
 */
abstract class DataAbstract
{
    /**
     * Internal property bag.
     * Child classes must declare this with default values to define allowed fields.
     *
     * @var array<string, mixed>
     */
    protected array $data = [];

    /**
     * @param array<string, mixed> $data Raw data to hydrate from storage.
     */
    public function __construct(array $data = [])
    {
        if (!empty($data)) {
            $this->hydrate($data);
        }
    }

    // ============================================
    // PUBLIC API
    // ============================================

    /**
     * Get the raw internal data array, optionally with fallback default values.
     * Default values are only applied to keys that are null (never been set).
     *
     * @param array<string, mixed> $default_values Fallback values for null fields.
     * @return array<string, mixed>
     */
    final public function getData(array $default_values = []): array
    {
        if (empty($default_values)) {
            return $this->data;
        }

        $result = $this->data;
        foreach ($default_values as $key => $value) {
            if ($this->isAllowed($key) && $this->get($key) === null) {
                $result[$key] = $value;
            }
        }

        return $result;
    }

    /**
     * Fill object from external input.
     * Each value is validated then sanitized before storing.
     *
     * @param array<string, mixed> $input
     */
    final public function setData(array $input): static
    {
        foreach ($input as $key => $value) {
            if ($this->isAllowed($key)) {
                $this->set($key, $value);
            }
        }

        return $this;
    }

    // ============================================
    // INTERNAL
    // ============================================

    /**
     * Hydrate directly from storage, bypassing validation and sanitization.
     * Used only by the constructor (trusted data path).
     *
     * @param array<string, mixed> $data
     */
    final protected function hydrate(array $data): void
    {
        foreach ($data as $key => $value) {
            if ($this->isAllowed($key)) {
                $this->data[$key] = $value;
            }
        }
    }

    /**
     * Set a single property through the validate → sanitize pipeline.
     *
     * @param string $key
     * @param mixed  $value
     */
    protected function set(string $key, mixed $value): void
    {
        $this->validate($key, $value);
        $this->data[$key] = $this->sanitize($key, $value);
    }

    /**
     * Get a single property value.
     *
     * @param  string $key
     * @return mixed
     */
    protected function get(string $key): mixed
    {
        return $this->data[$key] ?? null;
    }

    /**
     * Check if a field is allowed based on declared $data keys.
     *
     * @param string $key
     */
    final protected function isAllowed(string $key): bool
    {
        return array_key_exists($key, $this->data);
    }

    /**
     * Validate a single field value before storing.
     * Override in child using match/switch on $key.
     * Should throw or return WP_Error on failure.
     *
     * @param string $key
     * @param mixed  $value
     */
    protected function validate(string $key, mixed $value): void
    {
    }

    /**
     * Sanitize a single field value before storing.
     * Override in child using match/switch on $key.
     *
     * @param  string $key
     * @param  mixed  $value
     * @return mixed
     */
    protected function sanitize(string $key, mixed $value): mixed
    {
        return $value;
    }
}
