import type { CaptchaAdapter } from "../adapters/captcha"

export const CAPTCHA_TEST_TOKEN_PASS = "test-token-pass"

export function captchaMock(): CaptchaAdapter {
	return async ({ token }) => token === CAPTCHA_TEST_TOKEN_PASS
}
