// routes/orders.js
// Amazon SP-API Orders endpoints

const express = require('express');
const router = express.Router();
const { spApiRequest } = require('../config/spapi-auth');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: parseInt(process.env.CACHE_TTL) || 300 });
const marketplaceId = process.env.SP_API_MARKETPLACE_ID || 'ATVPDKIKX0DER';

/**
 * GET /api/orders
 * Fetch recent orders from SP-API Orders v0
 * Query params: days (default 30), status, limit (default 20)
 */
router.get('/', async (req, res) => {
  const { days = 30, status, limit = 20 } = req.query;
  const cacheKey = `orders_${days}_${status}_${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ source: 'cache', ...cached });

  try {
    // Build date range
    const createdAfter = new Date();
    createdAfter.setDate(createdAfter.getDate() - parseInt(days));

    let query = `MarketplaceIds=${marketplaceId}&CreatedAfter=${createdAfter.toISOString()}&MaxResultsPerPage=${limit}`;
    if (status) query += `&OrderStatuses=${status}`;

    const data = await spApiRequest({
      method: 'GET',
      path: '/orders/v0/orders',
      query,
    });

    const orders = (data.payload?.Orders || []).map(order => ({
      orderId: order.AmazonOrderId,
      status: order.OrderStatus,
      purchaseDate: order.PurchaseDate,
      lastUpdateDate: order.LastUpdateDate,
      fulfillmentChannel: order.FulfillmentChannel,
      salesChannel: order.SalesChannel,
      shipServiceLevel: order.ShipServiceLevel,
      orderTotal: order.OrderTotal,
      numberOfItems: order.NumberOfItemsShipped + order.NumberOfItemsUnshipped,
      shippedItems: order.NumberOfItemsShipped,
      pendingItems: order.NumberOfItemsUnshipped,
      buyerInfo: {
        email: order.BuyerInfo?.BuyerEmail,
        name: order.BuyerInfo?.BuyerName,
      },
    }));

    const result = {
      orders,
      count: orders.length,
      nextToken: data.payload?.NextToken || null,
    };

    cache.set(cacheKey, result);
    res.json({ source: 'api', ...result });

  } catch (err) {
    console.error('[Orders Error]', err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json({
      error: 'Failed to fetch orders',
      detail: err?.response?.data?.errors?.[0]?.message || err.message,
    });
  }
});

/**
 * GET /api/orders/:orderId
 * Fetch a single order's details + order items
 */
router.get('/:orderId', async (req, res) => {
  const { orderId } = req.params;
  const cacheKey = `order_${orderId}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ source: 'cache', ...cached });

  try {
    const [orderData, itemsData] = await Promise.all([
      spApiRequest({ method: 'GET', path: `/orders/v0/orders/${orderId}` }),
      spApiRequest({ method: 'GET', path: `/orders/v0/orders/${orderId}/orderItems` }),
    ]);

    const order = orderData.payload;
    const items = (itemsData.payload?.OrderItems || []).map(item => ({
      asin: item.ASIN,
      orderItemId: item.OrderItemId,
      title: item.Title,
      quantity: item.QuantityOrdered,
      quantityShipped: item.QuantityShipped,
      itemPrice: item.ItemPrice,
      itemTax: item.ItemTax,
      promotionDiscount: item.PromotionDiscount,
      conditionId: item.ConditionId,
      isGift: item.IsGift,
    }));

    const result = { order, items };
    cache.set(cacheKey, result);
    res.json({ source: 'api', ...result });

  } catch (err) {
    console.error('[Order Detail Error]', err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json({
      error: 'Failed to fetch order detail',
      detail: err?.response?.data?.errors?.[0]?.message || err.message,
    });
  }
});

/**
 * GET /api/orders/summary/revenue
 * Calculate revenue totals from recent orders
 */
router.get('/summary/revenue', async (req, res) => {
  const { days = 30 } = req.query;
  const cacheKey = `revenue_summary_${days}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ source: 'cache', ...cached });

  try {
    const createdAfter = new Date();
    createdAfter.setDate(createdAfter.getDate() - parseInt(days));

    const data = await spApiRequest({
      method: 'GET',
      path: '/orders/v0/orders',
      query: `MarketplaceIds=${marketplaceId}&CreatedAfter=${createdAfter.toISOString()}&MaxResultsPerPage=100&OrderStatuses=Shipped,Delivered`,
    });

    const orders = data.payload?.Orders || [];

    let totalRevenue = 0;
    let totalOrders = orders.length;
    let fbaCount = 0;
    let fbmCount = 0;
    const statusBreakdown = {};

    orders.forEach(order => {
      if (order.OrderTotal?.Amount) {
        totalRevenue += parseFloat(order.OrderTotal.Amount);
      }
      if (order.FulfillmentChannel === 'AFN') fbaCount++;
      else fbmCount++;
      statusBreakdown[order.OrderStatus] = (statusBreakdown[order.OrderStatus] || 0) + 1;
    });

    const result = {
      days: parseInt(days),
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      currency: orders[0]?.OrderTotal?.CurrencyCode || 'USD',
      totalOrders,
      averageOrderValue: totalOrders > 0 ? parseFloat((totalRevenue / totalOrders).toFixed(2)) : 0,
      fulfillment: { fba: fbaCount, fbm: fbmCount },
      statusBreakdown,
    };

    cache.set(cacheKey, result);
    res.json({ source: 'api', ...result });

  } catch (err) {
    console.error('[Revenue Summary Error]', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to calculate revenue', detail: err.message });
  }
});

module.exports = router;
