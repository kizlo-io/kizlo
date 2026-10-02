<?php

namespace Kizlo\WooCommerce\Modules\Storefront;

use WP_REST_Response;

/**
 * Serves the storefront settings and tells the Kizlo app when they change.
 *
 * WooCommerce writes `woocommerce_*` options for its own bookkeeping as well as
 * for settings, so an option change only marks the payload stale. At shutdown the
 * payload is rebuilt once, and the cache is cleared and the event sent only if the
 * result differs, which keeps routine background writes from revalidating the
 * frontend.
 */
class StorefrontModule
{
    public const EVENT = 'settings.woocommerce.updated';

    public const HASH_OPTION = 'kizlo_woocommerce_storefront_hash';

    private bool $stale = false;

    private bool $changed = false;

    /** @var callable(string): mixed */
    private $emit;

    /** @param (callable(string): mixed)|null $emit */
    public function __construct(private Storefront $storefront = new Storefront(), ?callable $emit = null)
    {
        $this->emit = $emit ?? 'kizlo_emit_event';
    }

    public function register(): void
    {
        StorefrontSchema::register();

        kizlo_register_route([
            'id'        => 'woocommerce.kizlo.storefront',
            'operation' => 'retrieve',
            'method'    => 'GET',
            'route'     => '/woocommerce/storefront',
            'summary'   => 'The store settings a storefront renders with',
            'input'     => ['type' => 'object'],
            'responses' => [
                '200' => ['description' => 'The storefront settings.', 'body' => ['$ref' => StorefrontSchema::ID]],
            ],
            'callback'  => [$this, 'retrieve'],
        ]);

        add_action('added_option', [$this, 'markStaleOnOption']);
        add_action('updated_option', [$this, 'markStaleOnOption']);
        add_action('deleted_option', [$this, 'markStaleOnOption']);

        // A plugin can change the address locale or the checkout fields through
        // filters without touching any option. The request that switches it still
        // runs with the old set of filters, so comparing would find no change.
        add_action('activated_plugin', [$this, 'markChanged']);
        add_action('deactivated_plugin', [$this, 'markChanged']);

        add_action('shutdown', [$this, 'flush']);
    }

    public function retrieve(): WP_REST_Response
    {
        $locale  = determine_locale();
        $payload = StorefrontCache::get($locale);

        if ($payload === null) {
            // A settings change that lands while this builds must not have its
            // invalidation undone by this request writing the old payload back.
            $generation = StorefrontCache::generation();
            $payload    = $this->storefront->build();

            if (StorefrontCache::generation() === $generation) {
                StorefrontCache::set($locale, $payload);
            }
        }

        return new WP_REST_Response($payload, 200);
    }

    public function markStaleOnOption(string $option): void
    {
        if (str_starts_with($option, 'woocommerce_')) $this->stale = true;
    }

    public function markStale(): void
    {
        $this->stale = true;
    }

    public function markChanged(): void
    {
        $this->changed = true;
    }

    public function flush(): void
    {
        if ($this->changed) {
            $this->changed = false;
            $this->stale   = false;

            delete_option(self::HASH_OPTION);
            $this->announce();

            return;
        }

        if (! $this->stale) return;
        $this->stale = false;

        // Labels and state names are translated, so a payload is only comparable
        // with an earlier one built in the same locale. A locale seen for the
        // first time counts as a change, once.
        $locale = determine_locale();
        $hashes = get_option(self::HASH_OPTION);
        $hashes = is_array($hashes) ? $hashes : [];
        $hash   = md5((string) wp_json_encode($this->storefront->build()));

        if (($hashes[$locale] ?? null) === $hash) return;

        $hashes[$locale] = $hash;
        update_option(self::HASH_OPTION, $hashes, false);
        $this->announce();
    }

    private function announce(): void
    {
        StorefrontCache::invalidate();
        ($this->emit)(self::EVENT);
    }
}
