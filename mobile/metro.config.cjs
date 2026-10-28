const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Share only the pure taxonomy/insight modules, not server files or web React.
config.watchFolders = [...new Set([...(config.watchFolders || []), path.resolve(__dirname, '../src/lib')])];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.resolver.extraNodeModules = { ...config.resolver.extraNodeModules, react: path.resolve(__dirname, 'node_modules/react'), 'react-native': path.resolve(__dirname, 'node_modules/react-native') };
module.exports = config;
