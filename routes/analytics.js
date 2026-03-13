// routes/analytics.js
// Amazon SP-API Reports + Sales Analytics

const express = require('express');
const router = express.Router();
const { spApiRequest } = require('../config/spapi-auth');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: parseInt(process.env.CACHE_TTL) || 300 });
const marketplaceId = process.env.SP_API_MARKETPLACE_ID || 'ATVPDKIKX0DER';

/**
 * GET /api/analytics/sales
 * Get sales metrics using Sales API
 * Query: interval (Day/Week/Month), startDate, endDate
 */
router.get('/sales', async (req, res) => {
  const { interval = 'DAY', startDate, endDate } = req.query;

  // Default: last 30 days
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const cacheKey = `sales_${interval}_${start.toDateString()}_${end.toDateString()}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ source: 'cache', ...cached });

  try {
    const query = [
      `marketplaceIds=${marketplaceId}`,
      `interval=${interval}`,
      `granularity=TOTAL`,
      `startDate=${start.toISOString()}`,
      `endDate=${end.toISOString()}`,
    ].join('&');

    const data = await spApiRequest({
      method: 'GET',
      path: '/sales/v1/orderMetrics',
      query,
    });

    const metrics = (data.payload || []).map(m => ({
      interval: m.interval,
      unitCount: m.unitCount,
      orderItemCount: m.orderItemCount,
      orderCount: m.orderCount,
      averageUnitPrice: m.averageUnitPrice,
      totalSales: m.totalSales,
    }));

    const totals = metrics.reduce((acc, m) => ({
      unitCount: acc.unitCount + (m.unitCount || 0),
      orderCount: acc.orderCount + (m.orderCount || 0),
      totalSalesAmount: acc.totalSalesAmount + parseFloat(m.totalSales?.amount || 0),
    }), { unitCount: 0, orderCount: 0, totalSalesAmount: 0 });

    const result = {
      metrics,
      totals: {
        ...totals,
        totalSalesAmount: parseFloat(totals.totalSalesAmount.toFixed(2)),
        currency: data.payload?.[0]?.totalSales?.currencyCode || 'USD',
      },
      dateRange: { start: start.toISOString(), end: end.toISOString() },
    };

    cache.set(cacheKey, result);
    res.json({ source: 'api', ...result });

  } catch (err) {
    console.error('[Sales Analytics Error]', err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json({
      error: 'Failed to fetch sales metrics',
      detail: err?.response?.data?.errors?.[0]?.message || err.message,
    });
  }
});

/**
 * POST /api/analytics/report
 * Request a report from SP-API Reports API
 * Body: { reportType, startDate, endDate }
 * 
 * Common report types:
 *   GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL
 *   GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA
 *   GET_SALES_AND_TRAFFIC_REPORT
 *   GET_MERCHANT_LISTINGS_ALL_DATA
 */
router.post('/report', async (req, res) => {
  const { reportType, startDate, endDate } = req.body;

  if (!reportType) {
    return res.status(400).json({ error: 'reportType is required' });
  }

  try {
    const body = {
      reportType,
      marketplaceIds: [marketplaceId],
      ...(startDate && { dataStartTime: new Date(startDate).toISOString() }),
      ...(endDate && { dataEndTime: new Date(endDate).toISOString() }),
    };

    const data = await spApiRequest({
      method: 'POST',
      path: '/reports/2021-06-30/reports',
      body,
    });

    res.json({
      reportId: data.reportId,
      message: 'Report requested. Poll /api/analytics/report/:reportId for status.',
    });

  } catch (err) {
    console.error('[Report Request Error]', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to request report', detail: err.message });
  }
});

/**
 * GET /api/analytics/report/:reportId
 * Check report status and get download URL when ready
 */
router.get('/report/:reportId', async (req, res) => {
  const { reportId } = req.params;

  try {
    const data = await spApiRequest({
      method: 'GET',
      path: `/reports/2021-06-30/reports/${reportId}`,
    });

    if (data.processingStatus === 'DONE' && data.reportDocumentId) {
      // Get the download URL
      const docData = await spApiRequest({
        method: 'GET',
        path: `/reports/2021-06-30/documents/${data.reportDocumentId}`,
      });

      return res.json({
        status: 'DONE',
        reportType: data.reportType,
        downloadUrl: docData.url,
        compressionAlgorithm: docData.compressionAlgorithm,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // URLs expire in ~5 min
      });
    }

    res.json({
      status: data.processingStatus, // CANCELLED, DONE, FATAL, IN_PROGRESS, IN_QUEUE
      reportId: data.reportId,
      reportType: data.reportType,
      createdTime: data.createdTime,
    });

  } catch (err) {
    console.error('[Report Status Error]', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to get report status', detail: err.message });
  }
});

/**
 * GET /api/analytics/fees
 * Estimate FBA fees for a product
 * Query: asin, price
 */
router.get('/fees', async (req, res) => {
  const { asin, price = '29.99' } = req.query;
  if (!asin) return res.status(400).json({ error: 'asin query param required' });

  try {
    const data = await spApiRequest({
      method: 'GET',
      path: `/products/fees/v0/items/${asin}/feesEstimate`,
      query: `MarketplaceId=${marketplaceId}&IdType=ASIN&IdValue=${asin}&PriceToEstimateFees.ListingPrice.Amount=${price}&PriceToEstimateFees.ListingPrice.CurrencyCode=USD&IsAmazonFulfilled=true`,
    });

    res.json({ asin, fees: data.payload?.FeesEstimateResult || data.payload });

  } catch (err) {
    console.error('[Fees Error]', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to estimate fees', detail: err.message });
  }
});

module.exports = router;
