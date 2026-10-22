import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

const keysToGenerate = ['API_SECRET_KEY', 'JUDGE_API_KEY', 'AUDIT_HMAC_SECRET'];

function generateKey() {
    return crypto.randomBytes(32).toString('hex');
}

function maskKey(key) {
    if (key.length < 8) return '****';
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}

function loadEnv() {
    if (!fs.existsSync(envPath)) return {};
    const envContent = fs.readFileSync(envPath, 'utf8');
    const env = {};
    envContent.split('\n').forEach(line => {
        const [key, ...value] = line.split('=');
        if (key && value.length > 0) {
            env[key.trim()] = value.join('=').trim();
        }
    });
    return env;
}

function saveEnv(env) {
    let content = '';
    for (const [key, value] of Object.entries(env)) {
        content += `${key}=${value}\n`;
    }
    fs.writeFileSync(envPath, content, 'utf8');
}

function main() {
    const rotate = process.argv.includes('--rotate');
    const currentEnv = loadEnv();
    const newEnv = { ...currentEnv };
    let generated = false;

    for (const key of keysToGenerate) {
        if (!newEnv[key] || rotate) {
            const newKey = generateKey();
            newEnv[key] = newKey;
            console.log(`Generated ${key}: ${maskKey(newKey)}`);
            generated = true;
        } else {
            console.log(`${key} already exists. Masked: ${maskKey(newEnv[key])}`);
        }
    }

    if (generated || rotate) {
        saveEnv(newEnv);
        console.log(`Updated .env file at ${envPath}`);
    } else {
        console.log('No secrets generated.');
    }
}

main();
