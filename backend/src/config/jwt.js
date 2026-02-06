require('dotenv').config();

// Fail fast if JWT_SECRET is not set - never use a default secret
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable must be set');
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters long');
  process.exit(1);
}

module.exports = {
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN || '24h'
};
