<?php

namespace Kizlo\Pos\Modules\Security;

use Kizlo\Pos\Support\Lock;
use Kizlo\Pos\Support\Permissions;
use lbuchs\WebAuthn\WebAuthn;
use WP_REST_Request;

final class Security
{
    public const PIN = '_kizlo_pos_pin';
    public const IDLE = '_kizlo_pos_idle_minutes';
    public const KEYS = '_kizlo_pos_passkeys';
    private const ATTEMPTS = '_kizlo_pos_pin_attempts';
    private static array $profileUpdates = [];

    public function register(): void
    {
        add_action('rest_api_init', [$this, 'routes']);
        add_filter('rest_pre_dispatch', [$this, 'guard'], 20, 3);
        add_action('show_user_profile', [$this, 'profile']);
        add_action('edit_user_profile', [$this, 'profile']);
        add_action('user_profile_update_errors', [$this, 'validateProfile'], 100, 3);
        add_action('profile_update', [$this, 'saveProfile']);
    }

    public static function idleMinutes(int $id): int
    {
        $minutes = (int) get_user_meta($id, self::IDLE, true);
        return $minutes >= 1 && $minutes <= 240 ? $minutes : 15;
    }

    private static function pin(int $id): string { return (string) get_user_meta($id, self::PIN, true); }

    private static function session(): array
    {
        $token = wp_get_session_token();
        $manager = \WP_Session_Tokens::get_instance(get_current_user_id());
        $session = $token !== '' ? $manager->get($token) : null;
        if (!$session) throw new SecurityError('Your WordPress session has ended. Sign in again.', 401);
        return $session;
    }

    private static function saveSession(array $session): void
    {
        \WP_Session_Tokens::get_instance(get_current_user_id())->update(wp_get_session_token(), $session);
    }

    public static function locked(): bool
    {
        $hash = self::pin(get_current_user_id());
        if ($hash === '') return true;
        try { $state = self::session()['kizlo_pos'] ?? []; }
        catch (SecurityError) { return true; }
        return !empty($state['locked']) || empty($state['active_at'])
            || !hash_equals(hash('sha256', $hash), (string) ($state['version'] ?? ''))
            || time() - (int) $state['active_at'] >= self::idleMinutes(get_current_user_id()) * 60;
    }

    public static function status(): array
    {
        $id = get_current_user_id();
        $origin = self::origin();
        $remaining = self::idleMinutes($id) * 60;
        if (self::pin($id) !== '') {
            try { $remaining = max(0, $remaining - (time() - (int) (self::session()['kizlo_pos']['active_at'] ?? 0))); }
            catch (SecurityError) { $remaining = 0; }
        }
        return ['configured' => self::pin($id) !== '', 'locked' => self::locked(),
            'idle_minutes' => self::idleMinutes($id), 'idle_remaining' => $remaining, 'has_passkey' => (bool) get_user_meta($id, self::KEYS, true),
            'passkey_available' => str_starts_with($origin, 'https://') && class_exists(WebAuthn::class) && function_exists('openssl_open') && function_exists('mb_strlen')];
    }

    public function guard(mixed $result, \WP_REST_Server $server, WP_REST_Request $request): mixed
    {
        $route = strtolower($request->get_route());
        if ((!str_starts_with($route, '/kizlo-pos/v1/') && !str_starts_with($route, '/kizlo/v1/pos/'))
            || $route === '/kizlo-pos/v1/security' || str_starts_with($route, '/kizlo-pos/v1/security/')) return $result;
        if (Permissions::access() === true && self::pin(get_current_user_id()) === '') {
            return new \WP_Error('kizlo_pos_pin_required', 'Set up your POS PIN before opening the sales screen.', ['status' => 428]);
        }
        if (Permissions::access() === true && self::locked()) {
            return new \WP_Error('kizlo_pos_locked', 'POS is locked. Unlock it to continue.', ['status' => 423]);
        }
        return $result;
    }

    public function routes(): void
    {
        foreach (['' => ['GET', 'status'], '/lock' => ['POST', 'lock'], '/unlock' => ['POST', 'unlock'],
            '/activity' => ['POST', 'activity'], '/settings' => ['POST', 'settings'],
            '/passkey/register/options' => ['POST', 'registerOptions'], '/passkey/register' => ['POST', 'registerKey'],
            '/passkey/unlock/options' => ['POST', 'unlockOptions'], '/passkey/unlock' => ['POST', 'unlockKey'],
            '/passkeys' => ['DELETE', 'removeKeys']] as $suffix => [$method, $callback]) {
            register_rest_route('kizlo-pos/v1', '/security' . $suffix, ['methods' => $method,
                'permission_callback' => [Permissions::class, 'access'],
                'callback' => function (WP_REST_Request $request) use ($callback) {
                    try {
                        return Lock::run('security:' . get_current_user_id(), function () use ($request, $callback) {
                            $data = $callback === 'status' ? self::status() : $this->$callback($request);
                            return new \WP_REST_Response($data, 200, ['Cache-Control' => 'private, no-store']);
                        });
                    } catch (SecurityError $error) {
                        return new \WP_Error('kizlo_pos_security', $error->getMessage(), ['status' => $error->status]);
                    } catch (\Throwable $error) {
                        wc_get_logger()->error('POS security operation failed: ' . $error::class, ['source' => 'kizlo-pos']);
                        return new \WP_Error('kizlo_pos_security', 'Unable to verify this request. Try your PIN or sign in again.', ['status' => 503]);
                    }
                }]);
        }
    }

    private static function body(WP_REST_Request $request): array
    {
        if (strlen($request->get_body()) > 131072) throw new SecurityError('The request is too large.');
        $body = json_decode($request->get_body(), true);
        if (!is_array($body)) throw new SecurityError('A JSON object is required.');
        return $body;
    }

    private static function prove(array $body): void
    {
        $id = get_current_user_id();
        $attempts = get_user_meta($id, self::ATTEMPTS, true) ?: [];
        if ((int) ($attempts['until'] ?? 0) > time()) throw new SecurityError('Too many attempts. Wait one minute and try again.', 429);
        $pin = $body['pin'] ?? '';
        $password = $body['password'] ?? '';
        $valid = is_string($pin) && preg_match('/^[0-9]{6}$/D', $pin) && self::pin($id) !== '' && wp_check_password($pin, self::pin($id));
        if (!$valid && is_string($password) && $password !== '' && strlen($password) <= 4096) {
            $valid = wp_check_password($password, wp_get_current_user()->user_pass, $id);
        }
        if (!$valid) {
            $count = (int) ($attempts['count'] ?? 0) + 1;
            update_user_meta($id, self::ATTEMPTS, ['count' => $count >= 5 ? 0 : $count, 'until' => $count >= 5 ? time() + 60 : 0]);
            throw new SecurityError('The PIN or WordPress password is incorrect.', 403);
        }
        delete_user_meta($id, self::ATTEMPTS);
    }

    private static function grant(): array
    {
        $session = self::session();
        $session['kizlo_pos'] = ['version' => hash('sha256', self::pin(get_current_user_id())), 'active_at' => time(), 'locked' => false];
        self::saveSession($session);
        return self::status();
    }

    public function unlock(WP_REST_Request $request): array
    {
        $body = self::body($request);
        // The unlock screen accepts a PIN only; WordPress password recovery stays in settings.
        unset($body['password']);
        self::prove($body);
        return self::grant();
    }

    public function lock(WP_REST_Request $request): array
    {
        if (self::pin(get_current_user_id()) === '') throw new SecurityError('Set a POS PIN in User settings first.');
        $session = self::session();
        $session['kizlo_pos']['locked'] = true;
        unset($session['kizlo_pos_challenge']);
        self::saveSession($session);
        return self::status();
    }

    public function activity(WP_REST_Request $request): array
    {
        if (self::locked()) throw new SecurityError('POS is locked. Unlock it to continue.', 423);
        if (self::pin(get_current_user_id()) !== '') {
            $session = self::session();
            $session['kizlo_pos']['active_at'] = time();
            self::saveSession($session);
        }
        return self::status();
    }

    private static function validateSettings(array $body): array
    {
        $minutes = $body['idle_minutes'] ?? 15;
        if (!is_int($minutes) || $minutes < 1 || $minutes > 240) throw new SecurityError('Choose an auto-lock time from 1 to 240 minutes.');
        $pin = $body['new_pin'] ?? '';
        if (!is_string($pin) || ($pin !== '' && !preg_match('/^[0-9]{6}$/D', $pin))) throw new SecurityError('Use a six-digit PIN.');
        if ($pin !== '' && $pin !== ($body['confirm_pin'] ?? '')) throw new SecurityError('The new PINs do not match.');
        return ['idle_minutes' => $minutes, 'pin' => $pin];
    }

    private static function applySettings(int $id, array $settings): void
    {
        update_user_meta($id, self::IDLE, $settings['idle_minutes']);
        if ($settings['pin'] !== '') {
            update_user_meta($id, self::PIN, wp_hash_password($settings['pin']));
            delete_user_meta($id, self::KEYS);
        }
    }

    public function settings(WP_REST_Request $request): array
    {
        $body = self::body($request);
        $settings = self::validateSettings($body);
        self::prove($body);
        self::applySettings(get_current_user_id(), $settings);
        return self::grant();
    }

    private static function origin(): string
    {
        $url = wp_parse_url(home_url('/'));
        return ($url['scheme'] ?? 'https') . '://' . ($url['host'] ?? '') . (isset($url['port']) ? ':' . $url['port'] : '');
    }

    private static function webauthn(): WebAuthn
    {
        if (!str_starts_with(self::origin(), 'https://')) throw new SecurityError('Device unlock requires HTTPS.');
        return new WebAuthn(wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES), wp_parse_url(home_url('/'), PHP_URL_HOST), ['none'], true);
    }

    private static function binary(mixed $value): string
    {
        if (!is_string($value) || !preg_match('/^[A-Za-z0-9_-]+$/D', $value)) throw new SecurityError('Invalid device response.');
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);
        if ($decoded === false) throw new SecurityError('Invalid device response.');
        return $decoded;
    }

    private static function challenge(WebAuthn $webauthn, string $operation): void
    {
        $session = self::session();
        $session['kizlo_pos_challenge'] = ['value' => base64_encode($webauthn->getChallenge()->getBinaryString()),
            'operation' => $operation, 'expires' => time() + 120, 'version' => hash('sha256', self::pin(get_current_user_id()))];
        self::saveSession($session);
    }

    private static function consume(array $body, string $operation): string
    {
        $session = self::session();
        $saved = $session['kizlo_pos_challenge'] ?? [];
        unset($session['kizlo_pos_challenge']);
        self::saveSession($session);
        if (($saved['operation'] ?? '') !== $operation || (int) ($saved['expires'] ?? 0) < time()
            || !hash_equals((string) ($saved['version'] ?? ''), hash('sha256', self::pin(get_current_user_id())))) {
            throw new SecurityError('Device verification expired. Please try again.');
        }
        $client = json_decode(self::binary($body['clientDataJSON'] ?? null), true);
        if (!is_array($client) || ($client['origin'] ?? '') !== self::origin() || !empty($client['crossOrigin'])) {
            throw new SecurityError('Device verification failed. Try your PIN.');
        }
        return (string) base64_decode($saved['value'], true);
    }

    public function registerOptions(WP_REST_Request $request): object
    {
        if (self::locked() || self::pin(get_current_user_id()) === '') throw new SecurityError('Unlock POS and set a PIN before enabling device unlock.', 423);
        self::prove(self::body($request));
        $keys = get_user_meta(get_current_user_id(), self::KEYS, true) ?: [];
        if (count($keys) >= 5) throw new SecurityError('Five passkeys are already registered. Remove them before adding another.');
        $webauthn = self::webauthn();
        $user = wp_get_current_user();
        $options = $webauthn->getCreateArgs((string) $user->ID, $user->user_login, $user->display_name, 60, false, true, false,
            array_map([self::class, 'binary'], array_keys($keys)));
        self::challenge($webauthn, 'register');
        return $options;
    }

    public function registerKey(WP_REST_Request $request): array
    {
        $body = self::body($request);
        $challenge = self::consume($body, 'register');
        if (self::locked()) throw new SecurityError('Unlock POS before enabling device unlock.', 423);
        try {
            $result = self::webauthn()->processCreate(self::binary($body['clientDataJSON'] ?? null), self::binary($body['attestationObject'] ?? null), $challenge, true);
        } catch (\Throwable) { throw new SecurityError('Device verification failed. Try your PIN.'); }
        $keys = get_user_meta(get_current_user_id(), self::KEYS, true) ?: [];
        if (count($keys) >= 5) throw new SecurityError('Five passkeys are already registered.');
        $id = rtrim(strtr(base64_encode($result->credentialId), '+/', '-_'), '=');
        $keys[$id] = ['public_key' => $result->credentialPublicKey, 'counter' => $result->signatureCounter, 'created' => time()];
        update_user_meta(get_current_user_id(), self::KEYS, $keys);
        return self::status();
    }

    public function unlockOptions(WP_REST_Request $request): object
    {
        $keys = get_user_meta(get_current_user_id(), self::KEYS, true) ?: [];
        if (!$keys || self::pin(get_current_user_id()) === '') throw new SecurityError('No passkey is registered for this account.');
        $webauthn = self::webauthn();
        $options = $webauthn->getGetArgs(array_map([self::class, 'binary'], array_keys($keys)), 60, true, true, true, true, true, 'required');
        self::challenge($webauthn, 'unlock');
        return $options;
    }

    public function unlockKey(WP_REST_Request $request): array
    {
        $body = self::body($request);
        $challenge = self::consume($body, 'unlock');
        $keys = get_user_meta(get_current_user_id(), self::KEYS, true) ?: [];
        $id = $body['id'] ?? '';
        $key = is_string($id) ? ($keys[$id] ?? null) : null;
        if (!$key || (!empty($body['userHandle']) && self::binary($body['userHandle']) !== (string) get_current_user_id())) {
            throw new SecurityError('Device verification failed. Try your PIN.');
        }
        $webauthn = self::webauthn();
        try {
            $webauthn->processGet(self::binary($body['clientDataJSON'] ?? null), self::binary($body['authenticatorData'] ?? null),
                self::binary($body['signature'] ?? null), $key['public_key'], $challenge, $key['counter'], true);
        } catch (\Throwable) { throw new SecurityError('Device verification failed. Try your PIN.'); }
        $keys[$id]['counter'] = $webauthn->getSignatureCounter();
        update_user_meta(get_current_user_id(), self::KEYS, $keys);
        return self::grant();
    }

    public function removeKeys(WP_REST_Request $request): array
    {
        self::prove(self::body($request));
        delete_user_meta(get_current_user_id(), self::KEYS);
        return self::status();
    }

    public function profile(\WP_User $user): void
    {
        if (!current_user_can('edit_user', $user->ID) || !user_can($user, 'manage_woocommerce')) return;
        echo '<h2>POS security</h2><table class="form-table" role="presentation"><tr><th><label for="kizlo-pos-pin">New POS PIN</label></th><td><input id="kizlo-pos-pin" name="kizlo_pos_pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password"><p class="description">Six digits. Leave blank to keep the current PIN. Changing it removes registered passkeys and locks other POS sessions.</p></td></tr>';
        echo '<tr><th><label for="kizlo-pos-confirm">Confirm new PIN</label></th><td><input id="kizlo-pos-confirm" name="kizlo_pos_confirm" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></td></tr>';
        echo '<tr><th><label for="kizlo-pos-idle">Auto-lock after</label></th><td><input id="kizlo-pos-idle" name="kizlo_pos_idle" type="number" min="1" max="240" value="' . esc_attr((string) self::idleMinutes($user->ID)) . '"> minutes</td></tr>';
        echo '<tr><th><label for="kizlo-pos-password">Your WordPress password</label></th><td><input id="kizlo-pos-password" name="kizlo_pos_password" type="password" autocomplete="current-password"><p class="description">Required when changing POS security settings.</p></td></tr></table>';
        wp_nonce_field('kizlo-pos-profile-' . $user->ID, 'kizlo_pos_security_nonce');
    }

    public function validateProfile(\WP_Error $errors, bool $update, object $user): void
    {
        if (!isset($_POST['kizlo_pos_security_nonce']) || !$update || $errors->has_errors()) return;
        $id = (int) $user->ID;
        if (!current_user_can('edit_user', $id) || !user_can($id, 'manage_woocommerce')) return;
        $nonce = wp_unslash($_POST['kizlo_pos_security_nonce']);
        if (!is_string($nonce) || !wp_verify_nonce($nonce, 'kizlo-pos-profile-' . $id)) { $errors->add('pos_security', 'The POS security request expired.'); return; }
        $pin = wp_unslash($_POST['kizlo_pos_pin'] ?? '');
        $minutes = wp_unslash($_POST['kizlo_pos_idle'] ?? '15');
        if ($pin === '' && (string) self::idleMinutes($id) === $minutes) return;
        try {
            Lock::run('security:' . get_current_user_id(), function () use ($id, $pin, $minutes): void {
                self::prove(['password' => wp_unslash($_POST['kizlo_pos_password'] ?? '')]);
                if (!is_string($minutes) || !ctype_digit($minutes)) throw new SecurityError('Choose an auto-lock time from 1 to 240 minutes.');
                self::$profileUpdates[$id] = self::validateSettings(['new_pin' => $pin, 'confirm_pin' => wp_unslash($_POST['kizlo_pos_confirm'] ?? ''), 'idle_minutes' => (int) $minutes]);
            });
        } catch (SecurityError $error) { $errors->add('pos_security', $error->getMessage()); }
    }

    public function saveProfile(int $id): void
    {
        if (isset(self::$profileUpdates[$id])) {
            Lock::run('security:' . $id, static fn() => self::applySettings($id, self::$profileUpdates[$id]));
            unset(self::$profileUpdates[$id]);
        }
    }
}
