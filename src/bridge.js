import { pending, upsert } from './store.js';
import { makeTcs } from './tcs.js';
import { makeShopifyAdmin } from './shopify.js';
import { sendAdminMail } from './mailer.js';

function toClientReference(order) {
  if (!order) return `REF-${Date.now()}`;
  if (order.name) return order.name;
  if (order.id) return `#${order.id}`;
  return order.order_number ? `#${order.order_number}` : `REF-${Date.now()}`;
}

function extractLineItems(order) {
  return (order?.line_items || []).map(item => ({
    id: item.id,
    quantity: item.fulfillable_quantity ?? item.quantity ?? 0
  })).filter(li => li.id && li.quantity > 0);
}

export function makeBridge(env) {
  const tcs = makeTcs(env);
  const shopify = makeShopifyAdmin(env);
  const trackingTemplate = env.TCS_TRACKING_URL || 'https://www.tcsexpress.com/tracking/${trackingNumber}';

  async function notify(subject, text) {
    try {
      await sendAdminMail(env, subject, text);
    } catch (err) {
      console.error('Failed to send admin email', err);
    }
  }

  async function handleShopifyOrder(order) {
    const clientReferenceNo = toClientReference(order);
    const baseRecord = {
      shopifyOrderId: order?.id || null,
      clientReferenceNo,
      status: 'ORDER_RECEIVED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lineItems: extractLineItems(order)
    };

    await upsert(baseRecord);
    await notify(`Order received ${clientReferenceNo}`, `Shopify order payload:\n${JSON.stringify(order, null, 2)}`);

    const consignee = await tcs.ensureConsignee(order).catch(async err => {
      await notify(`Consignee failed ${clientReferenceNo}`, `Error: ${String(err?.message || err)}`);
      throw err;
    });

    if (consignee?.consigneeCode) {
      await upsert({ ...baseRecord, consigneeCode: consignee.consigneeCode, status: 'CONSIGNEE_READY', updatedAt: new Date().toISOString() });
      await notify(`Consignee ready ${clientReferenceNo}`, `Consignee response:\n${JSON.stringify(consignee, null, 2)}`);
    }

    const so = await tcs.createSalesOrder(order, consignee?.consigneeCode, clientReferenceNo).catch(async err => {
      await notify(`SO failed ${clientReferenceNo}`, `Error: ${String(err?.message || err)}`);
      throw err;
    });

    const recordAfterSo = {
      ...baseRecord,
      consigneeCode: consignee?.consigneeCode,
      soNo: so?.soNo || so?.soNumber || null,
      status: so?.soNo || so?.soNumber ? 'SO_CREATED' : 'CONSIGNEE_READY',
      updatedAt: new Date().toISOString(),
      soResponse: so
    };
    await upsert(recordAfterSo);
    await notify(`SO created ${clientReferenceNo}`, `SO response:\n${JSON.stringify(so, null, 2)}`);

    return recordAfterSo;
  }

  async function syncPendingShipments(options = {}) {
    const results = [];
    const rows = await pending();
    for (const row of rows) {
      const record = { ...row };
      const clientReferenceNo = record.clientReferenceNo;
      const updates = {};

      if (!record.ginNo) {
        try {
          const gin = await tcs.fetchGin(record.soNo, clientReferenceNo);
          if (gin?.ginNo || gin?.ginNumber) {
            updates.ginNo = gin.ginNo || gin.ginNumber;
            updates.status = 'GIN_RECEIVED';
            updates.ginResponse = gin;
            await notify(`GIN received ${clientReferenceNo}`, `GIN response:\n${JSON.stringify(gin, null, 2)}`);
          }
        } catch (err) {
          await notify(`GIN failed ${clientReferenceNo}`, `Error: ${String(err?.message || err)}`);
        }
      }

      if ((record.ginNo || updates.ginNo) && !record.cnNo) {
        try {
          const cn = await tcs.fetchCn(record.soNo, record.ginNo || updates.ginNo, clientReferenceNo);
          if (cn?.cnNo || cn?.consignmentNumber || cn?.trackingNumber) {
            updates.cnNo = cn.cnNo || cn.consignmentNumber || cn.trackingNumber;
            updates.status = 'CN_RECEIVED';
            updates.cnResponse = cn;
            const trackingNumber = updates.cnNo;
            if (trackingNumber) {
              updates.trackingNumber = trackingNumber;
              updates.trackingUrl = trackingTemplate.replace('${trackingNumber}', trackingNumber);
            }
            await notify(`CN received ${clientReferenceNo}`, `CN response:\n${JSON.stringify(cn, null, 2)}`);
          }
        } catch (err) {
          await notify(`CN failed ${clientReferenceNo}`, `Error: ${String(err?.message || err)}`);
        }
      }

      if ((record.trackingNumber || updates.trackingNumber) && !record.fulfillmentId) {
        const storedLineItems = Array.isArray(record.lineItems) ? record.lineItems : [];
        if (storedLineItems.length === 0) {
          await notify(`Shopify fulfillment skipped ${clientReferenceNo}`, 'No line items stored for fulfillment.');
        } else {
          try {
            const trackingNumber = updates.trackingNumber || record.trackingNumber;
            const trackingUrl = updates.trackingUrl || record.trackingUrl || (trackingNumber ? trackingTemplate.replace('${trackingNumber}', trackingNumber) : undefined);
            const fulfillment = await shopify.createFulfillment({
              orderId: record.shopifyOrderId,
              clientReferenceNo,
              trackingNumber,
              trackingUrl,
              lineItems: storedLineItems,
              notifyCustomer: options.notifyCustomer !== false
            });
            if (fulfillment?.id) {
              updates.fulfillmentId = fulfillment.id;
              updates.status = 'FULFILLED';
              updates.fulfillmentResponse = fulfillment;
              await notify(`Shopify fulfilled ${clientReferenceNo}`, `Fulfillment response:\n${JSON.stringify(fulfillment, null, 2)}`);
            }
          } catch (err) {
            await notify(`Shopify fulfillment failed ${clientReferenceNo}`, `Error: ${String(err?.message || err)}`);
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date().toISOString();
        const updatedRecord = { ...record, ...updates };
        await upsert(updatedRecord);
        results.push(updatedRecord);
      }
    }
    return results;
  }

  return { handleShopifyOrder, syncPendingShipments };
}
