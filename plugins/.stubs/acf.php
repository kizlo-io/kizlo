<?php

/**
 * PHPStan stubs for the Advanced Custom Fields symbols used by kizlo-acf.
 *
 * ACF is an optional runtime dependency, not a composer dependency, so its
 * functions aren't visible to PHPStan. Declares only what kizlo-acf touches, so
 * analysis resolves them instead of reporting `function.notFound`. Stub only —
 * never loaded at runtime, never shipped.
 */

/**
 * @param array<string, mixed> $filter
 * @return array<int, array<string, mixed>>
 */
function acf_get_field_groups($filter = []) {}

/**
 * @param array<string, mixed>|string $field_group
 * @return array<int, array<string, mixed>>|false
 */
function acf_get_fields($field_group) {}

/**
 * @param int|string $post_id
 * @param bool       $format_value
 * @return array<string, mixed>|false
 */
function get_fields($post_id = false, $format_value = true) {}

/**
 * @param string     $selector
 * @param int|string $post_id
 * @param bool       $format_value
 * @return mixed
 */
function get_field($selector, $post_id = false, $format_value = true) {}

/**
 * @param array<string, mixed> $field_group
 */
function acf_add_local_field_group($field_group): void {}
