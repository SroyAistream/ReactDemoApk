// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require('path');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);

// Use a stable on-disk store (shared across web/android)
const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, '.metro-cache');
config.cacheStores = [
  new FileStore({ root: path.join(root, 'cache') }),
];

// Platform-specific module resolution - return null to use default resolver
// expo-sqlite is handled by platform-specific files (.native.ts and .web.ts)
// No custom resolution needed since we have database_helper.native.ts and database_helper.web.ts

// Reduce the number of workers to decrease resource usage
config.maxWorkers = 2;

module.exports = config;
