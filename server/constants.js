// Server Configuration Constants
// Centralized constants to avoid magic numbers throughout the codebase

module.exports = {
  // Session Configuration
  SESSION_EXPIRY_HOURS: 2, // Reduced from 24 hours for better security
  SESSION_EXPIRY_MS: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
  
  // API Configuration
  API_TIMEOUT_MS: 10000, // 10 seconds
  REQUEST_SIZE_LIMIT: '10mb', // Max request body size
  
  // Database Configuration
  DB_POOL_MAX_CONNECTIONS: 20,
  DB_POOL_IDLE_TIMEOUT_MS: 30000,
  DB_POOL_CONNECTION_TIMEOUT_MS: 30000, // 30 seconds for cloud database (was 2000 - too short!)
  
  // Session Cleanup
  SESSION_CLEANUP_INTERVAL_MS: 3600000, // 1 hour
  
  // Server
  DEFAULT_PORT: 9090,
  
  // Logging
  LOG_REQUEST_DETAILS: process.env.NODE_ENV !== 'production'
};
