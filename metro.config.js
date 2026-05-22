// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require('path');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);

// ─────────────────────────────────────────────────────────────────────────────
// 1. YOUR EXISTING OPTIMIZATIONS (Keep these!)
// ─────────────────────────────────────────────────────────────────────────────
// Use a stable on-disk store (shared across web/android)
const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, '.metro-cache');
config.cacheStores = [
  new FileStore({ root: path.join(root, 'cache') }),
];

// Reduce the number of workers to decrease resource usage
config.maxWorkers = 2;

// ─────────────────────────────────────────────────────────────────────────────
// 2. THE PREVIEW/RELEASE FIX (Anti-Minification Shield)
// ─────────────────────────────────────────────────────────────────────────────
// This ensures the production bundler doesn't scramble your database/API keys
config.transformer.minifierConfig = {
  keep_classnames: true, 
  keep_fnames: true,     
  mangle: {
    keep_fnames: true,
    reserved: ['genres', 'video_type', 'quality_list', 'name', 'id', 'genres_json', 'video_type_json']
  },
};

module.exports = config;