const { createClient } = require('@supabase/supabase-js');
const createHttpError = require('../utils/httpError');

let client;
let clientKey;
function storage() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret || !/^https:\/\//i.test(url)) {
    throw createHttpError(503, 'Image storage is temporarily unavailable');
  }
  const key = `${url}\u0000${secret}`;
  if (key !== clientKey) {
    client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    clientKey = key;
  }
  return client.storage;
}
function bucket(kind) {
  return kind === 'avatar' ? (process.env.SUPABASE_AVATAR_BUCKET || 'avatar')
    : (process.env.SUPABASE_COMPANY_LOGO_BUCKET || 'Company_logos');
}
function publicUrl(kind, path, updatedAt) {
  if (!path) return null;
  try {
    const url = storage().from(bucket(kind)).getPublicUrl(path).data.publicUrl;
    if (!url) return null;
    const parsed = new URL(url);
    if (updatedAt) parsed.searchParams.set('v', new Date(updatedAt).getTime().toString());
    return parsed.href;
  } catch { return null; }
}
async function upload(kind, path, file) {
  try {
    const { error } = await storage().from(bucket(kind)).upload(path, file.buffer, { contentType: file.mimetype, upsert: true, cacheControl: '60' });
    if (error) throw error;
  } catch (error) {
    if (error.statusCode === 503) throw error;
    throw createHttpError(503, 'Image storage is temporarily unavailable');
  }
}
async function remove(kind, path) {
  if (!path) return;
  try {
    const { error } = await storage().from(bucket(kind)).remove([path]);
    if (error) throw error;
  } catch (error) {
    if (error.statusCode === 503) throw error;
    throw createHttpError(503, 'Image storage is temporarily unavailable');
  }
}
module.exports = { storage, publicUrl, upload, remove };
