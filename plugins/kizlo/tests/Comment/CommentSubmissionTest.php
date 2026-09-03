<?php

namespace Kizlo\Tests\Comment;

use WP_REST_Request;
use WP_REST_Response;
use Kizlo\Modules\Comment\CommentSubmission;
use Kizlo\Tests\TestCase;

class CommentSubmissionTest extends TestCase
{
    private CommentSubmission $endpoint;
    private int $postId;

    public function setUp(): void
    {
        parent::setUp();

        $this->endpoint = new CommentSubmission();
        $this->postId   = self::factory()->post->create(['comment_status' => 'open']);
    }

    public function test_user_email_matching_a_user_attributes_the_comment_to_that_user(): void
    {
        $userId = self::factory()->user->create(['role' => 'subscriber', 'user_email' => 'member@example.com']);

        $comment = $this->submit(['user_email' => 'member@example.com', 'content' => 'From a signed-in member']);

        $this->assertSame($userId, (int) $comment->user_id);
    }

    public function test_an_authenticated_email_with_no_match_falls_back_to_author_email(): void
    {
        $comment = $this->submit([
            'user_email'   => 'no-account@example.com',
            'author_name'  => 'Guest Author',
            'author_email' => 'guest@example.com',
            'content'      => 'From an email without an account',
        ]);

        $this->assertSame(0, (int) $comment->user_id);
        $this->assertSame('guest@example.com', $comment->comment_author_email);
    }

    public function test_a_guest_author_email_is_never_attributed_to_a_matching_user(): void
    {
        self::factory()->user->create(['role' => 'subscriber', 'user_email' => 'victim@example.com']);

        $comment = $this->submit([
            'author_name'  => 'Impersonator',
            'author_email' => 'victim@example.com',
            'content'      => 'A guest typing someone else\'s address',
        ]);

        $this->assertSame(0, (int) $comment->user_id);
    }

    /** Submit through the endpoint and return the created comment. */
    private function submit(array $params): \WP_Comment
    {
        $request = new WP_REST_Request('POST', '/' . KIZLO_API_NAMESPACE . '/comments');
        $request->set_param('post_id', $this->postId);
        $request->set_param('author_ip', '203.0.113.5');
        $request->set_param('user_agent', 'PHPUnit');
        foreach ($params as $key => $value) {
            $request->set_param($key, $value);
        }

        $response = $this->endpoint->submit($request);

        $this->assertInstanceOf(WP_REST_Response::class, $response);
        $comment = get_comment((int) $response->get_data()['id']);
        $this->assertInstanceOf(\WP_Comment::class, $comment);

        return $comment;
    }
}
