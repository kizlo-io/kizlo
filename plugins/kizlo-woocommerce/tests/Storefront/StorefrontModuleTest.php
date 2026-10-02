<?php

namespace Kizlo\WooCommerce\Tests\Storefront;

use Kizlo\WooCommerce\Modules\Storefront\Storefront;
use Kizlo\WooCommerce\Modules\Storefront\StorefrontCache;
use Kizlo\WooCommerce\Modules\Storefront\StorefrontModule;
use Kizlo\WooCommerce\Modules\TaxId\TaxIdModule;
use Kizlo\WooCommerce\Tests\TestCase;
use WP_REST_Request;

class StorefrontModuleTest extends TestCase
{
    /** @var list<string> */
    private array $emitted = [];

    private StorefrontModule $module;

    public function setUp(): void
    {
        parent::setUp();

        update_option('woocommerce_allowed_countries', 'specific');
        update_option('woocommerce_specific_allowed_countries', ['IN', 'AE', 'IE']);
        update_option('woocommerce_ship_to_countries', '');

        $this->emitted = [];
        $this->module  = new StorefrontModule(new Storefront(), function (string $type): void {
            $this->emitted[] = $type;
        });

        add_action('added_option', [$this->module, 'markStaleOnOption']);
        add_action('updated_option', [$this->module, 'markStaleOnOption']);

        StorefrontCache::invalidate();
        delete_option(StorefrontModule::HASH_OPTION);
    }

    public function test_the_route_answers_the_storefront_settings(): void
    {
        $this->module->register();
        $this->bootRestServer();
        wp_set_current_user(self::factory()->user->create(['role' => 'administrator']));
        $GLOBALS['wp_rest_application_password_uuid'] = 'test-application-password';

        $response = rest_do_request(new WP_REST_Request('GET', '/kizlo/v1/woocommerce/storefront'));

        $this->assertSame(200, $response->get_status());
        $this->assertSame(['address', 'checkout', 'pricing', 'catalog'], array_keys($response->get_data()));
    }

    public function test_countries_are_only_the_ones_the_store_sells_to_sorted_by_name(): void
    {
        $countries = array_column($this->payload()['address']['countries'], null, 'code');

        $this->assertSame(['IN', 'IE', 'AE'], array_column($this->payload()['address']['countries'], 'code'));
        $this->assertSame('India', $countries['IN']['name']);
        $this->assertContains(['code' => 'MH', 'name' => 'Maharashtra'], $countries['IN']['states']);
        $this->assertTrue($countries['IN']['allowBilling']);
        $this->assertTrue($countries['IN']['allowShipping']);
        $this->assertSame('Eircode', ((array) $countries['IE']['locale'])['postcode']['label']);
        $this->assertStringContainsString('{postcode}', $countries['IE']['format']);
    }

    public function test_a_country_without_a_postcode_hides_it(): void
    {
        $ae = array_column($this->payload()['address']['countries'], null, 'code')['AE'];

        $postcode = ((array) $ae['locale'])['postcode'];

        $this->assertSame([], $ae['states']);
        $this->assertTrue($postcode['hidden']);
        $this->assertFalse($postcode['required']);
    }

    public function test_states_keep_woocommerces_order_when_their_codes_are_numeric(): void
    {
        update_option('woocommerce_specific_allowed_countries', ['JP']);

        $japan = $this->payload()['address']['countries'][0];

        $this->assertSame('JP', $japan['code']);
        $this->assertSame(array_keys(WC()->countries->get_states('JP')), array_column($japan['states'], 'code'));
    }

    public function test_the_fields_carry_store_settings_and_plugin_fields_without_callbacks(): void
    {
        update_option('woocommerce_checkout_company_field', 'hidden');

        $fields = (array) $this->payload()['address']['fields'];

        $this->assertTrue($fields['company']['hidden']);
        $this->assertArrayHasKey(TaxIdModule::FIELD_ID, $fields);
        $this->assertArrayNotHasKey('sanitize_callback', $fields[TaxIdModule::FIELD_ID]);
        $this->assertArrayNotHasKey('validate_callback', $fields[TaxIdModule::FIELD_ID]);
        $this->assertContains(TaxIdModule::FIELD_ID, $this->payload()['address']['field_locations']['address']);
    }

    public function test_checkout_omits_the_sign_up_and_login_settings(): void
    {
        $checkout = $this->payload()['checkout'];

        foreach (['allows_signup', 'generate_password', 'show_login_reminder'] as $key) {
            $this->assertArrayNotHasKey($key, $checkout);
        }
        $this->assertArrayHasKey('allows_guest', $checkout);
    }

    public function test_pricing_uses_the_store_api_currency_format(): void
    {
        update_option('woocommerce_currency', 'INR');
        update_option('woocommerce_currency_pos', 'right_space');

        $currency = $this->payload()['pricing']['currency'];

        $this->assertSame('INR', $currency['currency_code']);
        $this->assertSame('', $currency['currency_prefix']);
        $this->assertStringStartsWith(' ', $currency['currency_suffix']);
    }

    public function test_each_locale_is_cached_separately(): void
    {
        $this->retrieveIn('en_US');
        $this->retrieveIn('fr_FR');

        $this->assertNotNull(StorefrontCache::get('en_US'));
        $this->assertNotNull(StorefrontCache::get('fr_FR'));
        $this->assertCount(2, get_transient(StorefrontCache::KEY));
    }

    public function test_a_cached_payload_is_served_without_rebuilding(): void
    {
        StorefrontCache::set(determine_locale(), ['cached' => true]);

        $this->assertSame(['cached' => true], $this->module->retrieve()->get_data());
    }

    public function test_a_settings_change_clears_the_cache_and_sends_the_event_once(): void
    {
        $this->settle();
        $this->module->retrieve();

        update_option('woocommerce_currency_pos', 'right');
        update_option('woocommerce_price_display_suffix', 'incl. GST');
        $this->module->flush();

        $this->assertFalse(get_transient(StorefrontCache::KEY));
        $this->assertSame([StorefrontModule::EVENT], $this->emitted);
    }

    public function test_an_unrelated_option_leaves_the_cache_in_place(): void
    {
        $this->settle();
        $this->module->retrieve();

        update_option('blogdescription', 'Something else');
        $this->module->flush();

        $this->assertNotFalse(get_transient(StorefrontCache::KEY));
        $this->assertSame([], $this->emitted);
    }

    public function test_a_woocommerce_write_that_changes_no_setting_sends_nothing(): void
    {
        $this->settle();
        $this->module->retrieve();

        update_option('woocommerce_kizlo_test_bookkeeping', (string) wp_rand());
        $this->module->flush();

        $this->assertNotFalse(get_transient(StorefrontCache::KEY));
        $this->assertSame([], $this->emitted);
    }

    public function test_switching_a_plugin_clears_the_cache_without_comparing(): void
    {
        $this->settle();
        $this->module->retrieve();

        $this->module->markChanged();
        $this->module->flush();

        $this->assertFalse(get_transient(StorefrontCache::KEY));
        $this->assertSame([StorefrontModule::EVENT], $this->emitted);
    }

    public function test_writes_from_requests_in_different_locales_do_not_keep_announcing(): void
    {
        $translated = new class extends Storefront {
            public function build(): array
            {
                return ['label' => determine_locale() === 'fr_FR' ? 'Code postal' : 'Postal code'];
            }
        };
        $this->module = new StorefrontModule($translated, function (string $type): void {
            $this->emitted[] = $type;
        });

        $this->flushIn('en_US');
        $this->flushIn('fr_FR');
        $this->emitted = [];

        foreach (['en_US', 'fr_FR', 'en_US', 'fr_FR'] as $locale) {
            $this->flushIn($locale);
        }

        $this->assertSame([], $this->emitted);
    }

    public function test_a_build_overtaken_by_an_invalidation_is_not_cached(): void
    {
        $overtaken = new class extends Storefront {
            public function build(): array
            {
                StorefrontCache::invalidate();

                return ['stale' => true];
            }
        };

        (new StorefrontModule($overtaken, static fn() => null))->retrieve();

        $this->assertNull(StorefrontCache::get(determine_locale()));
    }

    /** @return array<string, mixed> */
    private function payload(): array
    {
        return (new Storefront())->build();
    }

    private function retrieveIn(string $locale): void
    {
        $force = static fn(): string => $locale;
        add_filter('determine_locale', $force);
        $this->module->retrieve();
        remove_filter('determine_locale', $force);
    }

    private function flushIn(string $locale): void
    {
        $force = static fn(): string => $locale;
        add_filter('determine_locale', $force);
        $this->module->markStale();
        $this->module->flush();
        remove_filter('determine_locale', $force);
    }

    /** Record the current settings as already announced, then start counting. */
    private function settle(): void
    {
        $this->module->markStale();
        $this->module->flush();
        $this->emitted = [];
    }
}
