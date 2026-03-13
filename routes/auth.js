// routes/auth.js
// Test credentials and check SP-API connectivity

const express = require('express');
const router = express.Router();
const { getLWAToken, spApiRequest } = require('../config/spapi-auth');

/**
 * GET /api/auth/status
 * Check whether all credentials are configured and the API is reachable
 */
router.get('/status', async (req, res) => {
  const checks = {
    envVars: {
      ok: false,
      missing: [],
    },
    lwaToken: { ok: false, error: null },
    spApi: { ok: false, error: null },
  };

  // 1. Check required env vars
  const required = [
    'LWA_CLIENT_ID', 'LWA_CLIENT_SECRET', 'SP_API_REFRESH_TOKEN',
    'SP_API_MARKETPLACE_ID', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'
  ];
  const missing = required.filter(key => !process.env[key] || process.env[key].includes('REPLACE_ME'));
  checks.envVars.ok = missing.length === 0;
  checks.envVars.missing = missing;

  // 2. Test LWA token
  if (checks.envVars.ok) {
    try {
      const token = await getLWAToken();
      checks.lwaToken.ok = !!token;
    } catch (err) {
      checks.lwaToken.ok = false;
      checks.lwaToken.error = err?.response?.data?.error_description || err.message;
    }
  }

  // 3. Test SP-API (simple marketplace participation call)
  if (checks.lwaToken.ok) {
    try {
      await spApiRequest({
        method: 'GET',
        path: '/sellers/v1/marketplaceParticipations',
      });
      checks.spApi.ok = true;
    } catch (err) {
      checks.spApi.ok = false;
      checks.spApi.error = err?.response?.data?.errors?.[0]?.message || err.message;
    }
  }

  const allOk = checks.envVars.ok && checks.lwaToken.ok && checks.spApi.ok;

  res.json({
    connected: allOk,
    checks,
    message: allOk
      ? '✅ All systems connected — SP-API is ready!'
      : '❌ Setup incomplete — see checks for details',
    setupGuide: allOk ? null : 'See SETUP_GUIDE.md for step-by-step instructions',
  });
});

/**
 * GET /api/auth/marketplaces
 * List all marketplaces the seller participates in
 */
router.get('/marketplaces', async (req, res) => {
  try {
    const data = await spApiRequest({
      method: 'GET',
      path: '/sellers/v1/marketplaceParticipations',
    });

    const marketplaces = (data.payload || []).map(p => ({
      marketplaceId: p.marketplace?.id,
      name: p.marketplace?.name,
      country: p.marketplace?.countryCode,
      defaultCurrency: p.marketplace?.defaultCurrencyCode,
      defaultLanguage: p.marketplace?.defaultLanguageCode,
      isParticipating: p.participation?.isParticipating,
      hasSuspendedListings: p.participation?.hasSuspendedListings,
    }));

    res.json({ marketplaces, count: marketplaces.length });

  } catch (err) {
    console.error('[Marketplaces Error]', err?.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to fetch marketplaces',
      detail: err?.response?.data?.errors?.[0]?.message || err.message,
    });
  }
});

// POST /api/auth/test — test credentials sent from frontend settings page
router.post('/test', async (req, res) => {
  const { lwaClientId, lwaClientSecret, refreshToken, awsAccessKey, awsSecretKey, awsRegion, marketplaceId } = req.body;

  const result = { lwa: false, spapi: false, marketplace: false };

  try {
    // Test LWA token
    const tokenRes = await axios.post('https://api.amazon.com/auth/o2/token', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: lwaClientId,
      client_secret: lwaClientSecret,
    }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    if (tokenRes.data.access_token) {
      result.lwa = true;

      // Test SP-API with these credentials
      const spApiAuth = require('../config/spapi-auth');
      try {
        const testRes = await spApiAuth.makeSignedRequest({
          method: 'GET',
          path: '/sellers/v1/marketplaceParticipations',
          accessToken: tokenRes.data.access_token,
          awsAccessKey, awsSecretKey,
          awsRegion: awsRegion || 'us-east-1',
        });
        result.spapi = true;
        result.marketplace = testRes.data?.payload?.some(p => p.marketplace?.id === marketplaceId) ?? true;
      } catch(e) {
        result.spapiError = e.message;
      }
    }
  } catch(e) {
    result.lwaError = e.response?.data?.error_description || e.message;
    return res.status(400).json({ ...result, message: result.lwaError });
  }

  res.json(result);
});

module.exports = router;
