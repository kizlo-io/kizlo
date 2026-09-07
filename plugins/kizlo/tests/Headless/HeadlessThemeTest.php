<?php

namespace Kizlo\Tests\Headless;

use Kizlo\Modules\Headless\HeadlessTheme;
use Kizlo\Modules\Introspection\SpecStore;
use Kizlo\Tests\TestCase;
use WP_Hook;
use WP_REST_Request;
use WP_REST_Server;

/**
 * The bundled Kizlo Headless theme and the switching logic that activates it from
 * the `theme` toggle, stands it down when the toggle is off, and never leaves the
 * site on it after the plugin is deactivated.
 *
 * {@see HeadlessTheme::register()} runs during the plugin boot the test bootstrap
 * performs, so the theme directory is already registered here.
 */
class HeadlessThemeTest extends TestCase
{
    private ?WP_Hook $restApiInit = null;
    private ?WP_REST_Server $restServer = null;

    /**
     * The PUT case below fires `rest_api_init` on a fresh server, which registers
     * the deferred Kizlo routes and contributes their specs. Snapshot the hook and
     * server here and restore them (plus reset the spec store) in teardown so that
     * firing does not leak into the introspection document later tests build — the
     * same discipline the introspection suite's base case keeps.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $hook              = $GLOBALS['wp_filter']['rest_api_init'] ?? null;
        $this->restApiInit = $hook instanceof WP_Hook ? clone $hook : null;
        $this->restServer  = $GLOBALS['wp_rest_server'] ?? null;
    }

    protected function tearDown(): void
    {
        if ($this->restApiInit === null) {
            unset($GLOBALS['wp_filter']['rest_api_init']);
        } else {
            $GLOBALS['wp_filter']['rest_api_init'] = $this->restApiInit;
        }

        $GLOBALS['wp_rest_server'] = $this->restServer;
        SpecStore::reset();

        parent::tearDown();
    }

    public function test_the_bundled_theme_is_discoverable_and_classic(): void
    {
        $theme = wp_get_theme(HeadlessTheme::STYLESHEET);

        $this->assertTrue($theme->exists(), 'Kizlo Headless should be registered by HeadlessTheme::register().');
        $this->assertFalse($theme->is_block_theme(), 'Kizlo Headless must be classic so the Menus screen returns.');
    }

    public function test_the_theme_registers_a_nav_menu_location(): void
    {
        // In a real load `after_setup_theme` fires before `wp_loaded`; the test
        // harness re-fires it afterwards, so `add_theme_support('title-tag')`
        // trips the timing notice. The nav-menu registration under test is not
        // affected by it.
        $this->setExpectedIncorrectUsage("add_theme_support( 'title-tag' )");

        require wp_get_theme(HeadlessTheme::STYLESHEET)->get_stylesheet_directory() . '/functions.php';
        do_action('after_setup_theme');

        $this->assertArrayHasKey('primary', get_registered_nav_menus());
    }

    public function test_reconcile_activates_the_theme_when_desired(): void
    {
        HeadlessTheme::reconcile(true);

        $this->assertSame(HeadlessTheme::STYLESHEET, get_stylesheet());
    }

    public function test_reconcile_switches_away_when_no_longer_desired(): void
    {
        switch_theme(HeadlessTheme::STYLESHEET);
        $this->assertSame(HeadlessTheme::STYLESHEET, get_stylesheet());

        HeadlessTheme::reconcile(false);

        $this->assertNotSame(HeadlessTheme::STYLESHEET, get_stylesheet());
    }

    public function test_deactivation_switches_away_when_active(): void
    {
        switch_theme(HeadlessTheme::STYLESHEET);

        HeadlessTheme::onDeactivate();

        $this->assertNotSame(HeadlessTheme::STYLESHEET, get_stylesheet());
    }

    public function test_activation_reapplies_the_theme_when_the_preference_is_on(): void
    {
        // A prior deactivate switched the site off Kizlo Headless, but the stored
        // preference is still on: reactivation should put it back.
        update_option('kizlo_settings_headless', ['enabled' => true, 'theme' => true]);
        $this->assertNotSame(HeadlessTheme::STYLESHEET, get_stylesheet());

        HeadlessTheme::onActivate();

        $this->assertSame(HeadlessTheme::STYLESHEET, get_stylesheet());
    }

    public function test_activation_does_not_switch_when_the_preference_is_off(): void
    {
        update_option('kizlo_settings_headless', ['enabled' => false, 'theme' => true]);

        HeadlessTheme::onActivate();

        $this->assertNotSame(HeadlessTheme::STYLESHEET, get_stylesheet());
    }

    public function test_reconcile_twice_is_a_no_op(): void
    {
        HeadlessTheme::reconcile(true);
        HeadlessTheme::reconcile(true);

        $this->assertSame(HeadlessTheme::STYLESHEET, get_stylesheet());
    }

    public function test_a_put_enabling_the_toggle_activates_the_theme(): void
    {
        $this->actingAsAdmin();

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        do_action('rest_api_init', $wp_rest_server);

        $request = new WP_REST_Request('PUT', '/kizlo/v1/settings/headless');
        $request->set_header('content-type', 'application/json');
        $request->set_body((string) wp_json_encode(['enabled' => true, 'theme' => true]));

        $response = $wp_rest_server->dispatch($request);

        $this->assertSame(200, $response->get_status());
        $this->assertTrue($response->get_data()['theme']);
        $this->assertSame(HeadlessTheme::STYLESHEET, get_stylesheet());
    }
}
