const path = require('path');
const fs = require('fs');

let config = {
    defaults: true,
    leorc: false,
    environment: false
};

const configPath = path.resolve(__dirname, '../../leo.config.json');

function loadConfiguration() {
    console.log('📋 Loading configuration');

    if (fs.existsSync(configPath)) {
        try {
            const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            config = { ...config, ...fileConfig, defaults: false, leorc: true };
            console.log('✅ Configuration loaded from leo.config.json');
        } catch (err) {
            console.error('❌ Failed to parse leo.config.json:', err);
        }
    } else {
        console.log('📋 No configuration file found, using defaults and environment variables');
    }

    console.log('✅ Configuration loaded successfully');
    console.log('📊 Configuration sources:', config);
    return config;
}

async function initialize() {
    return loadConfiguration();
}

module.exports = {
    loadConfiguration,
    initialize,
    getConfig: () => config
};