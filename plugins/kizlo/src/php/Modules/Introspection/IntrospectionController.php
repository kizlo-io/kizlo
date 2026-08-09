<?php

namespace Kizlo\Modules\Introspection;

use WP_REST_Request;
use WP_REST_Response;

/**
 * `GET /wp-json/kizlo/v1/introspect`.
 *
 * Auth is the plugin-wide administrator / Application Password boundary, so an
 * anonymous caller gets 401 and an authenticated non-administrator 403 before
 * this ever runs.
 *
 * The response is always the document. Anything that could not be published is
 * listed under `diagnostics` with a `type` of `error` (excluded, so a type is
 * missing) or `warning` (ignored, so the types are still complete). Deciding
 * whether an error should fail a build is the consumer's call, not this
 * endpoint's, and a third-party plugin's mistake should never cost the site
 * owner the contract for their own routes.
 *
 * The document is rebuilt per request. Managed content comes from live settings,
 * and a contract that lags the API it describes is worse than one that costs a
 * couple of milliseconds. Repeat callers pay almost nothing anyway: the
 * document's own hash backs an `ETag`, so an unchanged contract returns 304.
 *
 * The route is deliberately not self-describing. A generator has to fetch it
 * before it can know anything, so a contract for it would be read by nobody.
 */
class IntrospectionController
{
    public function register(): void
    {
        kizlo_register_route([
            'methods'  => ['GET'],
            'route'    => '/introspect',
            'callback' => [$this, 'handle'],
        ]);
    }

    public function handle(WP_REST_Request $request): WP_REST_Response
    {
        ManagedContent::flush();

        $document = Registry::build();
        $etag     = sprintf('"%s"', $document['hash']);

        if ($this->matches($request, $etag)) {
            $response = new WP_REST_Response(null, 304);
            $response->header('ETag', $etag);

            return $response;
        }

        $response = new WP_REST_Response($document, 200);
        $response->header('ETag', $etag);
        $response->header('Cache-Control', 'no-cache, must-revalidate');

        return $response;
    }

    private function matches(WP_REST_Request $request, string $etag): bool
    {
        $header = $request->get_header('if_none_match');

        if (!is_string($header) || $header === '') {
            return false;
        }

        foreach (explode(',', $header) as $candidate) {
            if (trim(preg_replace('/^W\//', '', trim($candidate)) ?? '') === $etag) {
                return true;
            }
        }

        return false;
    }
}
