// routes/inventory.js
// Amazon SP-API FBA Inventory + Listings endpoints

const express = require('express');
const router = express.Router();
const { spApiRequest } = require('../config/spapi-auth');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: parseInt(process.env.CACHE_TTL) || 300 });
const marketplaceId = process.env.SP_API_MARKETPLACE_ID || 'ATVPDKIKX0DER';

/**
 * GET /api/inventory
 * Get FBA inventory summaries
 */
router.get('/', async (req, res) => {
  const { details = false } = req.query;
  const cacheKey = `inventory_${details}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ source: 'cache', ...cached });

  try {
    const query = `details=${details}&granularityType=Marketplace&granularityId=${marketplaceId}&marketplaceIds=${marketplaceId}`;

    const data = await spApiRequest({
      method: 'GET',
      path: '/fba/inventory/v1/summaries',
      query,
    });

    const summaries = (data.payload?.inventorySummaries || []).map(item => ({
      asin: item.asin,
      fnSku: item.fnSku,
      sellerSku: item.sellerSku,
      productName: item.productName,
      condition: item.condition,
      inventoryDetails: item.inventoryDetails || null,
      totalQuantity: item.totalQuantity,
      // FBA specific
      fulfillableQuantity: item.inventoryDetails?.fulfillableQuantity,
      inboundWorkingQuantity: item.inventoryDetails?.inboundWorkingQuantity,
      inboundShippedQuantity: item.inventoryDetails?.inboundShippedQuantity,
      reservedQuantity: item.inventoryDetails?.reservedQuantity?.totalReservedQuantity,
      unfulfillableQuantity: item.inventoryDetails?.unfulfillableQuantity?.totalUnfulfillableQuantity,
    }));

    // Flag low stock (less than 10 units)
    const lowStock = summaries.filter(s => (s.fulfillableQuantity || s.totalQuantity) < 10);

    const result = {
      inventory: summaries,
      count: summaries.length,
      lowStockCount: lowStock.length,
      lowStockItems: lowStock.map(s => s.sellerSku),
    };

    cache.set(cacheKey, result);
    res.json({ source: 'api', ...result });

  } catch (err) {
    console.error('[Inventory Error]', err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json({
      error: 'Failed to fetch inventory',
      detail: err?.response?.data?.errors?.[0]?.message || err.message,
    });
  }
});

/**
 * GET /api/inventory/listings
 * Get all active listings (Listings Items API)
 */
router.get('/listings', async (req, res) => {
  const cacheKey = 'listings_active';
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ source: 'cache', ...cached });

  try {
    // Note: requires sellerId — fetched from auth token info
    // For SP-API you need your seller ID
    const sellerId = process.env.SELLER_ID;
    if (!sellerId) {
      return res.status(400).json({ error: 'SELLER_ID not set in .env', hint: 'Add SELLER_ID=AXXXXXX to your .env file' });
    }

    const data = await spApiRequest({
      method: 'GET',
      path: `/listings/2021-08-01/items/${sellerId}`,
      query: `marketplaceIds=${marketplaceId}&includedData=summaries,attributes,issues`,
    });

    const listings = (data.items || []).map(item => ({
      sku: item.sku,
      summaries: item.summaries,
      status: item.summaries?.[0]?.status,
      asin: item.summaries?.[0]?.asin,
      productType: item.summaries?.[0]?.productType,
      itemName: item.summaries?.[0]?.itemName,
      createdDate: item.summaries?.[0]?.createdDate,
      issues: item.issues || [],
    }));

    const result = {
      listings,
      count: listings.length,
      activeCount: listings.filter(l => l.status === 'BUYABLE').length,
      issuesCount: listings.filter(l => l.issues?.length > 0).length,
    };

    cache.set(cacheKey, result);
    res.json({ source: 'api', ...result });

  } catch (err) {
    console.error('[Listings Error]', err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json({
      error: 'Failed to fetch listings',
      detail: err?.response?.data?.errors?.[0]?.message || err.message,
    });
  }
});

/**
 * GET /api/inventory/restock
 * Get FBA restock recommendations
 */
router.get('/restock', async (req, res) => {
  const cacheKey = 'restock_recommendations';
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ source: 'cache', ...cached });

  try {
    const data = await spApiRequest({
      method: 'GET',
      path: '/fba/inbound/v0/itemsGuidance',
      query: `MarketplaceId=${marketplaceId}`,
    });

    const result = { recommendations: data.payload || [], source: 'api' };
    cache.set(cacheKey, result);
    res.json(result);

  } catch (err) {
    console.error('[Restock Error]', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch restock data', detail: err.message });
  }
});

module.exports = router;
