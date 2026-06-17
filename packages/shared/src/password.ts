import z from "zod/v4"

const UPPERCASE_A_TO_Z_REGEX = /[A-Z]/
const LOWERCASE_A_TO_Z_REGEX = /[a-z]/
const NUMERIC_ZERO_TO_NINE_REGEX = /[0-9]/

// ====================================================
// SCHEMA
// ====================================================

/**
 * Password validation schema with the following requirements:
 * - Minimum 8 characters long
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one numeric digit (0-9)
 *
 * @example
 * // Valid password
 * passwordSchema.parse('SecurePass123'); // ✓
 *
 * @example
 * // Invalid passwords
 * passwordSchema.parse('weakpass');      // ✗ Missing uppercase & digit
 * passwordSchema.parse('SHORT123');      // ✗ Only 8 chars but meets all rules
 * passwordSchema.parse('NoDigits');      // ✗ Missing numeric digit
 */
export const PasswordSchema = z
	.string()
	.min(8, "Password must be at least 8 characters long")
	.refine((password) => UPPERCASE_A_TO_Z_REGEX.test(password), "Password must contain at least one uppercase letter")
	.refine((password) => LOWERCASE_A_TO_Z_REGEX.test(password), "Password must contain at least one lowercase letter")
	.refine((password) => NUMERIC_ZERO_TO_NINE_REGEX.test(password), "Password must contain at least one numeric digit")

/**
 * Quick boolean check to determine if a password is strong.
 * Returns true only if password passes all validation rules
 *
 * @param password - The password string to validate
 * @returns True if password is strong and meets all requirements, false otherwise
 *
 * @example
 * isStrongPassword('SecurePass123'); // true
 * isStrongPassword('weak'); // false
 */
export const isStrongPassword = (password: string): boolean => PasswordSchema.safeParse(password).success

// ====================================================
// PASSWORD STRENGTH
// ====================================================

export interface PasswordStrengthResult {
	isValid: boolean
	checks: {
		hasMinLength: boolean
		hasUppercase: boolean
		hasLowercase: boolean
		hasNumeric: boolean
	}
	errors: string[]
}

/**
 * Checks password strength and validates against all requirements
 * Provides detailed validation feedback for each requirement
 *
 * @param password - The password string to validate
 * @returns Validation result containing overall status, individual checks, and error messages
 *
 * @example
 * const result = checkPasswordStrength('SecurePass123');
 * console.log(result);
 * // {
 * //   isValid: true,
 * //   checks: { hasMinLength: true, hasUppercase: true, hasLowercase: true, hasNumeric: true },
 * //   errors: []
 * // }
 *
 * @example
 * const result = checkPasswordStrength('weak');
 * console.log(result.errors);
 * // ['Password must be at least 8 characters long', 'Password must contain at least one uppercase letter', ...]
 */
export function checkPasswordStrength(password: string): PasswordStrengthResult {
	const checks = {
		hasMinLength: password.length >= 8,
		hasUppercase: UPPERCASE_A_TO_Z_REGEX.test(password),
		hasLowercase: LOWERCASE_A_TO_Z_REGEX.test(password),
		hasNumeric: NUMERIC_ZERO_TO_NINE_REGEX.test(password),
	}

	const errors = []

	if (!checks.hasMinLength) {
		errors.push("Password must be at least 8 characters long")
	}
	if (!checks.hasUppercase) {
		errors.push("Password must contain at least one uppercase letter")
	}
	if (!checks.hasLowercase) {
		errors.push("Password must contain at least one lowercase letter")
	}
	if (!checks.hasNumeric) {
		errors.push("Password must contain at least one numeric digit")
	}

	return {
		isValid: errors.length === 0,
		checks,
		errors,
	}
}
