<?php

namespace Kizlo\Tests\Introspection;

use WP_REST_Request;
use WP_REST_Server;

/**
 * The managed attachment route creating a file rather than a row.
 *
 * `/post-types/attachment` was served through `WP_REST_Posts_Controller`, which
 * never looks at `$_FILES`. A create there would have inserted an attachment post
 * with nothing behind it: no file in `wp-content/uploads`, no `_wp_attached_file`,
 * no `source_url` to fetch and no thumbnails. So the operation was withheld from
 * the contract and never registered, and uploads had to go to the WordPress media
 * route instead, outside everything Kizlo describes.
 *
 * The route is served by the controller core registers for the type now, which is
 * `WP_REST_Attachments_Controller`, and it already does all of that work. What is
 * asserted here is the part a contract test cannot see: that a real multipart
 * request produces a real file. Nothing here checks the shape of the response —
 * {@see ManagedContentTest} and {@see DerivedItemSchemaTest} own that.
 */
class AttachmentUploadTest extends IntrospectionTestCase
{
    private WP_REST_Server $server;

    /** @var array<int, string> */
    private array $uploads = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->seedSettings();
        $this->actingAsAdmin();
        $this->boot();
    }

    /**
     * Uploads land in the real `wp-content/uploads` for the test install, and
     * `WP_UnitTestCase` rolls back the database but not the filesystem.
     */
    protected function tearDown(): void
    {
        foreach ($this->uploads as $path) {
            if (file_exists($path)) {
                unlink($path);
            }
        }

        $this->uploads = [];

        parent::tearDown();
    }

    /**
     * The bug, stated as the thing it produced: a row with no file. Every
     * assertion here failed before the controller swap, and the first one is the
     * whole issue — `wp_get_original_image_path()` reads `_wp_attached_file`,
     * which nothing was writing.
     */
    public function test_an_upload_creates_a_file_on_disk(): void
    {
        $response = $this->upload();

        $this->assertSame(201, $response->get_status(), $this->describeFailure($response));

        $data = $response->get_data();
        $path = get_attached_file($data['id']);

        $this->assertIsString($path);
        $this->uploads[] = $path;

        $this->assertFileExists($path);
        $this->assertGreaterThan(0, filesize($path));
        $this->assertSame('attachment', get_post($data['id'])->post_type);
    }

    /**
     * What a caller gets back, and the reason the file matters: an attachment with
     * no file behind it still returned a `source_url`, pointing at nothing.
     */
    public function test_the_created_attachment_reports_where_the_file_is(): void
    {
        $data = $this->upload()->get_data();

        $this->uploads[] = get_attached_file($data['id']);

        $this->assertStringEndsWith('.jpg', $data['source_url']);
        $this->assertSame('image', $data['media_type']);
        $this->assertSame('image/jpeg', $data['mime_type']);
        $this->assertNotEmpty($data['media_details']);
    }

    /**
     * The envelope is the reason this stayed on `/post-types/attachment` rather
     * than being handed to the core media route. `PostTypeExtension` never runs on
     * a core route, so an attachment created there would come back without the
     * block every other managed type carries.
     */
    public function test_an_uploaded_attachment_carries_the_kizlo_envelope(): void
    {
        $data = $this->upload()->get_data();

        $this->uploads[] = get_attached_file($data['id']);

        $this->assertArrayHasKey('kizlo', $data);
        $this->assertArrayHasKey('url', $data['kizlo']);
        $this->assertArrayHasKey('seo', $data['kizlo']);
    }

    /**
     * A create with no file part. The controller answers this itself; what matters
     * is that the route reaches it rather than inserting an empty attachment on
     * the way, which is what it used to do with every request.
     */
    public function test_a_create_without_a_file_is_refused_and_stores_nothing(): void
    {
        $before = wp_count_posts('attachment')->inherit;

        $request  = new WP_REST_Request('POST', '/kizlo/v1/post-types/attachment');
        $response = $this->server->dispatch($request);

        $this->assertSame(400, $response->get_status());
        $this->assertSame('rest_upload_no_data', $response->get_data()['code']);
        $this->assertSame($before, wp_count_posts('attachment')->inherit);
    }

    /**
     * The other half of the declaration. Update stays JSON, and it edits the
     * record rather than the binary, which is why it describes no file.
     */
    public function test_an_update_edits_the_record_without_touching_the_file(): void
    {
        $created = $this->upload()->get_data();
        $path    = get_attached_file($created['id']);

        $this->uploads[] = $path;

        $request = new WP_REST_Request('PATCH', '/kizlo/v1/post-types/attachment/' . $created['id']);
        $request->set_header('content-type', 'application/json');
        $request->set_body(wp_json_encode(['alt_text' => 'A field of canola']));

        $response = $this->server->dispatch($request);

        $this->assertSame(200, $response->get_status(), $this->describeFailure($response));
        $this->assertSame('A field of canola', $response->get_data()['alt_text']);
        $this->assertSame($path, get_attached_file($created['id']));
        $this->assertFileExists($path);
    }

    // ============================================================
    // HELPERS
    // ============================================================

    /**
     * A multipart create, the way a client sends one.
     *
     * `set_file_params()` is what `rest_api_loaded()` does with `$_FILES` on a real
     * request, and it does it for every REST route rather than only core's, which
     * is why a managed route needs no plumbing of its own to receive an upload.
     *
     * The file is copied because `wp_handle_upload()` moves it, and the copy comes
     * from the test data rather than being fabricated: `wp_check_filetype_and_ext()`
     * reads the real image to confirm the extension, so a file with a `.jpg` name
     * and no image inside it is rejected before any of this is exercised.
     */
    private function upload(): \WP_REST_Response
    {
        $source = DIR_TESTDATA . '/images/canola.jpg';
        $file   = get_temp_dir() . 'kizlo-canola-' . uniqid() . '.jpg';

        copy($source, $file);

        $request = new WP_REST_Request('POST', '/kizlo/v1/post-types/attachment');
        $request->set_header('content-type', 'multipart/form-data');
        $request->set_file_params([
            'file' => [
                'name'     => 'canola.jpg',
                'type'     => 'image/jpeg',
                'tmp_name' => $file,
                'error'    => 0,
                'size'     => filesize($file),
            ],
        ]);

        return $this->server->dispatch($request);
    }

    private function describeFailure(\WP_REST_Response $response): string
    {
        return $response->get_status() < 400
            ? ''
            : sprintf('The route answered %d: %s', $response->get_status(), wp_json_encode($response->get_data()));
    }

    private function boot(): void
    {
        global $wp_rest_server;

        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;

        do_action('rest_api_init', $this->server);
    }
}
