<?php

namespace Kizlo\Modules\Settings\Crawling;

class CrawlingSettings
{
    public RobotsSettings $robots;

    public function __construct(array $data = [])
    {
        $this->robots = new RobotsSettings($data['robots'] ?? []);
    }

    public static function load(): static
    {
        // @phpstan-ignore new.static
        $instance         = new static();
        $instance->robots = RobotsSettings::load();
        return $instance;
    }

    public function getData(): array
    {
        return [
            'robots' => $this->robots->getData(),
        ];
    }
}
