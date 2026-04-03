// All environment-driven constants in one place.
// Every other module imports from here instead of reading process.env directly.

module.exports = {
  PORT:                            process.env.PORT || 5000,
  JWT_SECRET:                      process.env.JWT_SECRET || "gso_secret_key",
  SECURITY_CODE_TTL_MINUTES:       Number(process.env.SECURITY_CODE_TTL_MINUTES     || 10),
  SECURITY_CODE_MIN_RETRY_SECONDS: Number(process.env.SECURITY_CODE_MIN_RETRY_SECONDS || 300),
  SECURITY_CODE_MAX_ATTEMPTS:      Number(process.env.SECURITY_CODE_MAX_ATTEMPTS     || 5),
};
