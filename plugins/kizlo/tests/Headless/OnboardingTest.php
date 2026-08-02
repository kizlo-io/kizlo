<?php

namespace Kizlo\Tests\Headless;

use Kizlo\Tests\TestCase;
use Kizlo\Modules\Headless\Onboarding;

/**
 * Onboarding: activation only recommends Headless Mode via the banner. It is never
 * seeded or auto-enabled; turning it on is always an explicit human action.
 */
class OnboardingTest extends TestCase
{
    private function headless(): ?array
    {
        return get_option('kizlo_settings_headless', null);
    }

    public function test_activation_flags_the_banner_and_keeps_master_off(): void
    {
        Onboarding::activate();

        $this->assertNull($this->headless(), 'Activation should not seed the headless option.');
        $this->assertSame('1', get_option('kizlo_headless_banner'));
    }

    public function test_activation_never_seeds_even_when_other_settings_exist(): void
    {
        // Presence of other Kizlo settings must not be mistaken for an upgrade that
        // should silently switch Headless Mode on.
        update_option('kizlo_settings_site', ['url' => 'https://example.com']);

        Onboarding::activate();

        $this->assertNull($this->headless(), 'Existing settings must not auto-enable Headless Mode.');
        $this->assertSame('1', get_option('kizlo_headless_banner'));
    }

    public function test_opt_in_switches_on_every_feature_and_mirrors_blog_public(): void
    {
        update_option('blog_public', '1');

        (new Onboarding())->optIn();

        $seeded = $this->headless();
        $this->assertIsArray($seeded);

        // These need an explicit choice, so they stay off/empty even on full opt-in:
        // the redirect mode (hiding with a 404 is the secure default) and login
        // renaming (which needs a user-chosen slug).
        $optional = ['frontend_lockout_redirect' => false, 'rename_login' => false, 'login_slug' => null];

        foreach ($seeded as $key => $value) {
            $expected = array_key_exists($key, $optional) ? $optional[$key] : true;
            $this->assertSame($expected, $value, "{$key} after opt-in");
        }

        // block_indexing is on, so the WordPress origin is discouraged (blog_public falsy).
        $this->assertEmpty(get_option('blog_public'));
        $this->assertFalse(get_option('kizlo_headless_banner'));
    }

    public function test_reactivation_does_not_overwrite_existing_choices(): void
    {
        $chosen = ['enabled' => true, 'preview' => false, 'frontend_lockout' => true];
        update_option('kizlo_settings_headless', $chosen);

        Onboarding::activate();

        $this->assertSame($chosen, $this->headless());
        $this->assertFalse(get_option('kizlo_headless_banner'), 'A configured install should not be re-prompted.');
    }
}
