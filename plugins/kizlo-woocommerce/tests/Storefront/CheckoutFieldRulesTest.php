<?php

namespace Kizlo\WooCommerce\Tests\Storefront;

use Automattic\WooCommerce\Blocks\Domain\Services\CheckoutFieldsSchema\DocumentObject;
use Automattic\WooCommerce\Blocks\Domain\Services\CheckoutFieldsSchema\Validation;
use Kizlo\WooCommerce\Tests\TestCase;

/** Shared with Kit's service-free fixtures; evaluated here by the pinned WooCommerce implementation. */
class CheckoutFieldRulesTest extends TestCase
{
    public function test_kit_rule_fixtures_agree_with_woocommerce_draft_seven_evaluation(): void
    {
        $fixtures = json_decode(file_get_contents(__DIR__ . '/../fixtures/checkout-field-rules.json'), true, 512, JSON_THROW_ON_ERROR);

        foreach ($fixtures as $fixture) {
            $document = new class($fixture['document']) extends DocumentObject {
                private array $fixture;

                public function __construct(array $fixture)
                {
                    $this->fixture = $fixture;
                }

                public function get_data()
                {
                    // Preserve object-valued JSON document buckets, including empty additional-fields objects.
                    return json_decode(json_encode($this->fixture));
                }
            };
            $evaluate = static function ($rule) use ($document): bool {
                if (is_bool($rule)) return $rule;
                if (empty($rule)) return false;

                return true === Validation::validate_document_object($document, $rule);
            };
            $hidden   = $evaluate($fixture['hidden']);
            $required = ! $hidden && $evaluate($fixture['required']);

            $this->assertSame($fixture['expected'], ['required' => $required, 'hidden' => $hidden], $fixture['name']);
        }
    }
}
