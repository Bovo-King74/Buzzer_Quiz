'use strict';
const crypto = require('crypto');
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 200) => typeof value === 'string' ? value.slice(0, max) : '';
const code = value => { const normalized = text(value, 8).trim().toUpperCase(); return /^[A-Z]{4}$/.test(normalized) ? normalized : ''; };
const playerId = value => typeof value === 'string' && /^[a-f0-9]{8}$/i.test(value) ? value.toLowerCase() : '';
const creationToken = value => typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value) ? value.toLowerCase() : '';
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && /^[-+]?\d{1,5}(?:\.\d{1,3})?$/.test(value.trim()) ? Number(value) : NaN;
function secretEqual(actual, candidate) {
  if (typeof actual !== 'string' || typeof candidate !== 'string' || actual.length !== candidate.length || candidate.length > 128) return false;
  const a = Buffer.from(actual), b = Buffer.from(candidate);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function origin(value) {
  if (typeof value !== 'string' || value.length > 512) return '';
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : '';
  } catch { return ''; }
}
function originPolicy(allowed = '') {
  const allowlist = new Set(text(allowed, 8192).split(',').map(s => origin(s.trim())).filter(Boolean));
  function requestOrigin(req) {
    const host = text(req.headers?.host, 255);
    // Honor the existing one-hop HTTPS proxy setup; browsers cannot set this upgrade header.
    const forwarded = text(req.headers?.['x-forwarded-proto'], 32).split(',')[0].trim();
    return origin(`${req.socket?.encrypted || forwarded === 'https' ? 'https' : 'http'}://${host}`);
  }
  function allows(req) {
    const raw = req.headers?.origin;
    if (raw === undefined) return true; // CLI and local originless Socket.IO clients still authenticate per event.
    const supplied = origin(raw);
    return !!supplied && (supplied === requestOrigin(req) || allowlist.has(supplied));
  }
  function publicOrigin(req, supplied) {
    const candidate = origin(supplied);
    if (candidate && (candidate === requestOrigin(req) || allowlist.has(candidate))) return candidate;
    return origin(req.headers?.origin) || requestOrigin(req);
  }
  return { allows, requestOrigin, publicOrigin };
}
module.exports = { object, text, code, playerId, creationToken, number, secretEqual, origin, originPolicy };
