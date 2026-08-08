<?php

namespace Kizlo\Tests\Registration;

use InvalidArgumentException;
use Kizlo\Modules\Registration\PostTypeRegistration;
use Kizlo\Modules\Registration\RegistrationValidator;
use Kizlo\Tests\TestCase;

/**
 * Keys are validated for shape, reserved names, and collisions against runtime
 * objects and stored definitions (active or inactive).
 */
class RegistrationValidatorTest extends TestCase
{
    public function test_a_valid_fresh_key_passes(): void
    {
        RegistrationValidator::assertPostTypeKey('book');
        RegistrationValidator::assertTaxonomyKey('genre');

        $this->assertTrue(true);
    }

    public function test_reserved_keys_are_rejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        RegistrationValidator::assertPostTypeKey('post');
    }

    public function test_wp_prefixed_post_type_keys_are_rejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        RegistrationValidator::assertPostTypeKey('wp_thing');
    }

    public function test_invalid_charset_is_rejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        RegistrationValidator::assertPostTypeKey('Book Type');
    }

    public function test_post_type_key_length_cap_is_enforced(): void
    {
        $this->expectException(InvalidArgumentException::class);
        RegistrationValidator::assertPostTypeKey(str_repeat('a', 21));
    }

    public function test_taxonomy_key_allows_up_to_thirty_two_characters(): void
    {
        RegistrationValidator::assertTaxonomyKey(str_repeat('a', 32));

        $this->expectException(InvalidArgumentException::class);
        RegistrationValidator::assertTaxonomyKey(str_repeat('a', 33));
    }

    public function test_an_existing_kizlo_definition_blocks_reuse(): void
    {
        $definition = new PostTypeRegistration();
        $definition->setData(['key' => 'book', 'active' => false]);
        $definition->save('book');

        // Inactive definitions are not registered at runtime but still collide.
        $this->expectException(InvalidArgumentException::class);
        RegistrationValidator::assertPostTypeKey('book');
    }
}
