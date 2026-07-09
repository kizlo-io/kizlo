<?php

namespace Kizlo\Tests\Settings;

use Kizlo\Tests\TestCase;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;

/**
 * The shared breadcrumbs setting (HasBreadcrumbsSetting), exercised through
 * PostTypeSettings' save path: the '__parent__' token is preserved, page IDs are
 * coerced to positive ints, and anything else (non-numeric, zero) is dropped.
 */
class BreadcrumbsSettingTest extends TestCase
{
    public function test_sanitize_keeps_token_and_valid_ids_and_drops_the_rest(): void
    {
        $settings = new PostTypeSettings([]);
        $settings->setData(['breadcrumbs' => ['__parent__', '42', 'abc', '0', 99]]);

        $this->assertSame(['__parent__', 42, 99], $settings->getBreadcrumbs());
    }

    public function test_breadcrumbs_default_to_empty_list(): void
    {
        $settings = new PostTypeSettings([]);
        $this->assertSame([], $settings->getBreadcrumbs());

        $settings->setData(['breadcrumbs' => 'not-an-array']);
        $this->assertSame([], $settings->getBreadcrumbs());
    }
}
