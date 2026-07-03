<?php

namespace Kizlo\Modules\Seo;

class HomeSchema extends SeoBase
{
    /**
     * Build SEO meta data for the homepage.
     *
     * @return array
     */
    public function buildMeta(): array
    {
        $site        = $this->settings->site;
        $title       = $site->getName() ?? get_bloginfo('name');
        $description = $site->getTagline() ?? get_bloginfo('description') ?: null;
        $image       = $this->homeImage();

        return [
            'title'     => $title,
            'canonical' => $this->settings->getBaseUrl(),
            'robots'    => $this->buildRobots(true),
            'og'        => $this->buildOg([
                'type'        => 'website',
                'title'       => $title,
                'description' => $description,
                'url'         => $this->settings->getBaseUrl(),
                'image'       => $image,
            ]),
            'twitter'   => $this->buildTwitter([
                'title'       => $title,
                'description' => $description,
                'image'       => $image['url'] ?? null,
                'image_alt'   => null,
            ]),
            'article'   => null,
        ];
    }

    /**
     * Build the full JSON-LD graph for the homepage.
     *
     * @return array
     */
    public function jsonLd(): array
    {
        $graph   = $this->baseGraph();
        $graph[] = $this->homeWebPageLd();

        $image = $this->homeImage();
        if (!empty($image)) {
            $graph[] = $this->primaryImageLd(
                $this->settings->getBaseUrl(),
                $image['url'],
                $image['width'],
                $image['height'],
                $image['alt'] ?? ($this->settings->site->getName() ?? get_bloginfo('name')),
            );
        }

        return $this->toGraph($graph);
    }

    /**
     * Generate WebPage JSON-LD piece for the homepage.
     *
     * @return array
     */
    protected function homeWebPageLd(): array
    {
        $site  = $this->settings->site;
        $image = $this->homeImage();

        return $this->webPageLd([
            'url'            => $this->settings->getBaseUrl(),
            'title'          => $site->getName() ?? get_bloginfo('name'),
            'description'    => $site->getTagline() ?? get_bloginfo('description') ?: null,
            'image_url'      => $image['url'] ?? null,
            'date_published' => null,
            'date_modified'  => null,
            'breadcrumb_id'  => null,
            'webpage_type'   => null,
            'article_type'   => null,
        ]);
    }

    /**
     * Resolve the homepage's fallback image details.
     *
     * @return array{url: string, width: int|null, height: int|null, type: string|null, alt: string|null}|null
     */
    protected function homeImage(): ?array
    {
        $id = $this->settings->site->getFallbackImage();

        if (empty($id)) return null;

        $metadata = wp_get_attachment_metadata($id);

        return [
            'url'    => wp_get_attachment_url($id),
            'width'  => $metadata['width']  ?? null,
            'height' => $metadata['height'] ?? null,
            'type'   => get_post_mime_type($id) ?: null,
            'alt'    => get_post_meta($id, '_wp_attachment_image_alt', true) ?: null,
        ];
    }
}
