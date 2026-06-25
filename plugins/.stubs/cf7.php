<?php

/**
 * PHPStan stubs for the Contact Form 7 plugin symbols used by kizlo-cf7.
 *
 * CF7 is an optional runtime dependency, not a composer dependency, so its
 * classes/functions aren't visible to PHPStan. Declares only what kizlo-cf7
 * touches, so analysis resolves them instead of reporting `class.notFound` /
 * `function.notFound`. Stub only — never loaded at runtime, never shipped.
 */

class WPCF7_ContactForm
{
    public function id(): int {}

    /** @return array<string, mixed> */
    public function submit(): array {}
}

/**
 * @param int|string $id
 * @return \WPCF7_ContactForm|null
 */
function wpcf7_contact_form($id) {}
