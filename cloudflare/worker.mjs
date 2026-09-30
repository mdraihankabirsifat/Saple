import http from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import app from '../backend/app.js';
import database from '../backend/config/database.js';

// This is the only Cloudflare-specific application entry point. The Express
// app, routes, controllers, services and repositories remain shared with
// backend/server.js.
process.env.SAPLE_RUNTIME = 'cloudflare';

const INTERNAL_PORT = 8787;
const server = http.createServer(app);
server.listen(INTERNAL_PORT);
const expressHandler = httpServerHandler({ port: INTERNAL_PORT });

const TEXT_BINDINGS = [
  'JWT_SECRET', 'JWT_EXPIRES_IN', 'FRONTEND_URL', 'CORS_ORIGINS', 'SECURITY_CONTACT',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
  'AI_ENABLED', 'AI_API_KEY', 'AI_API_BASE_URL', 'AI_MODEL', 'AI_TIMEOUT_MS',
  'AI_MAX_OUTPUT_TOKENS', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY',
  'SUPABASE_AVATAR_BUCKET', 'SUPABASE_COMPANY_LOGO_BUCKET',
  'PASSWORD_RESET_TOKEN_TTL_MINUTES',
  'PAYMENT_GATEWAY', 'SSLCOMMERZ_BASE_URL', 'SSLCOMMERZ_SESSION_BASE_URL', 'SSLCOMMERZ_VALIDATION_BASE_URL',
  'SSLCOMMERZ_STORE_ID', 'SSLCOMMERZ_STORE_PASSWORD',
  'PUBLIC_API_ORIGIN', 'PREMIUM_AI_MODEL', 'PREMIUM_AI_DAILY_CHAT_LIMIT', 'PREMIUM_RESUME_DAILY_LIMIT'
];
let configuredConnectionString;

function copyTextBindings(env) {
  for (const name of TEXT_BINDINGS) {
    if (typeof env?.[name] === 'string') process.env[name] = env[name];
  }
  process.env.SAPLE_RUNTIME = 'cloudflare';
  process.env.DB_FALLBACK_ENABLED = 'false';
  process.env.DB_PRIMARY_SOURCE = 'supabase';
}

function configureRuntime(env) {
  copyTextBindings(env);
  const connectionString = env?.HYPERDRIVE?.connectionString;
  if (connectionString && connectionString !== configuredConnectionString) {
    database.configureWorker({ connectionString });
    configuredConnectionString = connectionString;
  }
}

function isExpressPath(pathname) {
  return pathname === '/api'
    || pathname.startsWith('/api/')
    || pathname === '/robots.txt'
    || pathname === '/sitemap.xml'
    || pathname === '/security.txt'
    || pathname === '/.well-known/security.txt';
}

export default {
  async fetch(request, env, ctx) {
    configureRuntime(env);
    const pathname = new URL(request.url).pathname;

    // Ordinary HTML/CSS/JS/image requests remain Cloudflare static assets.
    // Only API and generated crawler/security routes invoke Express.
    if (!isExpressPath(pathname)) return env.ASSETS.fetch(request);
    return expressHandler.fetch(request, env, ctx);
  }
};
