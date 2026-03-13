// config/spapi-auth.js
// Handles Login with Amazon (LWA) token refresh + AWS Signature V4 signing

const axios = require('axios');
const crypto = require('crypto');

// ── LWA Token Cache ──
let cachedToken = null;
let tokenExpiry = 0;

/**
 * Get a fresh LWA access token (cached until expiry)
 */
async function getLWAToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 60000) {
    return cachedToken; // Return cached token (60s buffer)
  }

  const response = await axios.post('https://api.amazon.com/auth/o2/token', {
    grant_type: 'refresh_token',
    refresh_token: process.env.SP_API_REFRESH_TOKEN,
    client_id: process.env.LWA_CLIENT_ID,
    client_secret: process.env.LWA_CLIENT_SECRET,
  }, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  cachedToken = response.data.access_token;
  tokenExpiry = now + (response.data.expires_in * 1000);
  return cachedToken;
}

/**
 * AWS Signature Version 4 signing for SP-API requests
 */
function signRequest({ method, host, path, query = '', body = '', region, service = 'execute-api' }) {
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';

  const canonicalUri = path;
  const canonicalQueryString = query;
  const payloadHash = crypto.createHash('sha256').update(body).digest('hex');

  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';

  const signedHeaders = 'host;x-amz-date';

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), service),
    'aws4_request'
  );
  const signature = hmac(signingKey, stringToSign).toString('hex');

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authHeader, amzDate };
}

/**
 * Make an authenticated SP-API request
 */
async function spApiRequest({ method = 'GET', endpoint, path, query = '', body = null }) {
  const region = process.env.SP_API_REGION || 'us-east-1';
  const host = endpoint || `sellingpartnerapi-na.amazon.com`;

  const lwaToken = await getLWAToken();
  const { authHeader, amzDate } = signRequest({ method, host, path, query, body: body ? JSON.stringify(body) : '', region });

  const url = `https://${host}${path}${query ? '?' + query : ''}`;

  const headers = {
    'Authorization': authHeader,
    'x-amz-access-token': lwaToken,
    'x-amz-date': amzDate,
    'Content-Type': 'application/json',
  };

  const response = await axios({ method, url, headers, data: body || undefined });
  return response.data;
}

module.exports = { getLWAToken, spApiRequest };
