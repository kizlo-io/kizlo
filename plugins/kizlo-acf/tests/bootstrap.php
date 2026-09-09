<?php

/**
 * PHPUnit bootstrap for the Kizlo ACF plugin.
 *
 * `AcfSchema` is a pure mapper, so this suite needs no WordPress: it autoloads
 * the plugin and runs on its own. The one external symbol it touches is the core
 * plugin's `CoreSchemas` media constants — always present at runtime through the
 * `Requires Plugins: kizlo` dependency — so we load just that one file here, from
 * the sibling core plugin, rather than boot the whole stack.
 */

require_once dirname(__DIR__) . '/vendor/autoload.php';

$core_schemas = dirname(__DIR__, 2) . '/kizlo/src/php/Modules/Introspection/CoreSchemas.php';

if (is_file($core_schemas)) {
    require_once $core_schemas;
}
