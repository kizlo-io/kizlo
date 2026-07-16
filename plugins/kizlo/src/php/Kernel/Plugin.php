<?php

namespace Kizlo\Kernel;

use Kizlo\Modules\Admin\AdminModule;
use Kizlo\Modules\Appearance\AppearanceModule;
use Kizlo\Modules\Comment\CommentModule;
use Kizlo\Modules\Email\EmailModule;
use Kizlo\Modules\Post\PostModule;
use Kizlo\Modules\PostType\PostTypeModule;
use Kizlo\Modules\Preview\PreviewModule;
use Kizlo\Modules\RestApi\RestApiModule;
use Kizlo\Modules\Seo\SeoModule;
use Kizlo\Modules\Settings\SettingsModule;
use Kizlo\Modules\Taxonomy\TaxonomyModule;
use Kizlo\Modules\Upload\UploadModule;
use Kizlo\Modules\User\UserModule;
use YahnisElsts\PluginUpdateChecker\v5\PucFactory;

class Plugin
{
    private static ?Plugin $instance = null;

    /**
     * Core module classes loaded via ModuleLoader. Each class is instantiated
     * with no arguments and its register() method is called.
     *
     * Integration-specific modules (WooCommerce, CF7, …) live in their own
     * extension plugins and hook into `kizlo_loaded` to register themselves.
     *
     * @var array<int, class-string>
     */
    private array $modules = [
        AdminModule::class,
        SettingsModule::class,
        PreviewModule::class,
        PostModule::class,
        PostTypeModule::class,
        UserModule::class,
        SeoModule::class,
        EmailModule::class,
        AppearanceModule::class,
        RestApiModule::class,
        TaxonomyModule::class,
        CommentModule::class,
        UploadModule::class,
    ];

    private function __construct() {}

    public static function instance(): Plugin
    {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }

        return self::$instance;
    }

    public function boot(): void
    {
        PucFactory::buildUpdateChecker(
            'https://kizlo.io/plugin/updates/kizlo.json',
            KIZLO_FILE,
            'kizlo'
        );

        (new ModuleLoader($this->modules))->load();

        do_action('kizlo_loaded');
    }
}
