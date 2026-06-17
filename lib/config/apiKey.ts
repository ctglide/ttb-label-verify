/**
 * API key validation and secure access.
 *
 * The Anthropic API key must be set as a server-side environment variable only.
 * It must NEVER be prefixed with NEXT_PUBLIC_ or referenced in any client
 * component, as that would embed it in the browser-visible JavaScript bundle.
 *
 * In production (Azure Government), inject via Azure Key Vault reference or
 * Azure App Service encrypted application settings — never hardcoded or
 * committed to version control.
 */

const ANTHROPIC_KEY_PREFIX = "sk-ant-";
const MIN_KEY_LENGTH = 40;

/**
 * Validates and returns the Anthropic API key from the environment.
 * Throws a sanitized error if the key is missing or malformed —
 * the raw value is never included in error messages or logs.
 */
export function getValidatedApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key || key.trim() === "") {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. " +
      "Add it to .env.local for local development, or to Azure App Service " +
      "Application Settings for production. See .env.example for guidance."
    );
  }

  if (key === "sk-ant-your-key-here") {
    throw new Error(
      "ANTHROPIC_API_KEY is still set to the placeholder value from .env.example. " +
      "Replace it with a valid key from console.anthropic.com."
    );
  }

  if (!key.startsWith(ANTHROPIC_KEY_PREFIX)) {
    throw new Error(
      `ANTHROPIC_API_KEY has an unexpected format. ` +
      `Expected key starting with "${ANTHROPIC_KEY_PREFIX}". ` +
      "Verify the key was copied correctly from console.anthropic.com."
    );
  }

  if (key.length < MIN_KEY_LENGTH) {
    throw new Error(
      "ANTHROPIC_API_KEY appears too short to be valid. " +
      "Verify the key was copied in full from console.anthropic.com."
    );
  }

  return key;
}

/**
 * Returns a redacted version of the key safe for logging (e.g. "sk-ant-****...abc123").
 * Never log the full key.
 */
export function redactApiKey(key: string): string {
  if (key.length < 12) return "****";
  return `${key.slice(0, 10)}...${key.slice(-6)}`;
}
