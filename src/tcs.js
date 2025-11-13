let axiosModule;
try {
  const mod = await import('axios');
  axiosModule = mod?.default || mod;
} catch (err) {
  if (process.env.DEBUG_ENV) {
    console.warn('axios not loaded, falling back to fetch in tcs.js', err);
  }
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnv(value) {
  return String(value ?? '').toLowerCase() === 'true';
}

function fullNameFromOrder(order) {
  const shipping = order?.shipping_address || {};
  const name = [shipping.first_name, shipping.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (shipping.name) return shipping.name;
  if (order?.customer?.first_name || order?.customer?.last_name) {
    return [order?.customer?.first_name, order?.customer?.last_name].filter(Boolean).join(' ').trim();
  }
  return order?.name || order?.email || 'Shopify Customer';
}

function buildConsigneePayload(order, env) {
  const shipping = order?.shipping_address || {};
  return {
    consigneeName: fullNameFromOrder(order),
    addressLine1: shipping.address1 || '',
    addressLine2: shipping.address2 || '',
    city: shipping.city || '',
    state: shipping.province || shipping.province_code || '',
    country: shipping.country || shipping.country_code || 'Pakistan',
    postalCode: shipping.zip || shipping.postal_code || '',
    contactPerson: fullNameFromOrder(order),
    contactNumber: order?.phone || shipping.phone || '',
    email: order?.email || '',
    storerCode: env.STORER_CODE,
    projectCode: env.PROJECT_CODE,
    whCode: env.WH_CODE,
    status: 'A'
  };
}

function buildSalesOrderPayload(order, consigneeCode, clientReferenceNo, env) {
  const shipping = order?.shipping_address || {};
  const lineItems = (order?.line_items || []).map(item => ({
    sku: item.sku || item.skuCode || item.title,
    description: item.title,
    orderedQty: toNumber(item.quantity || item.fulfillable_quantity || 0, 0),
    uom: item.grams ? 'EA' : 'EA',
    unitPrice: String(item.price ?? '0')
  }));
  const totalQty = lineItems.reduce((acc, item) => acc + toNumber(item.orderedQty, 0), 0);
  const totalAmount = (order?.line_items || []).reduce((acc, item) => acc + toNumber(item.price || 0, 0) * toNumber(item.quantity || 0, 0), 0);

  return {
    clientReferenceNo,
    consigneeCode: consigneeCode || undefined,
    consigneeName: fullNameFromOrder(order),
    consigneeAddress1: shipping.address1 || '',
    consigneeAddress2: shipping.address2 || '',
    consigneeCity: shipping.city || '',
    consigneeProvince: shipping.province || '',
    consigneeCountry: shipping.country || shipping.country_code || 'Pakistan',
    consigneePhone: order?.phone || shipping.phone || '',
    consigneeEmail: order?.email || '',
    orderDate: new Date().toISOString(),
    storerCode: env.STORER_CODE,
    projectCode: env.PROJECT_CODE,
    whCode: env.WH_CODE,
    serviceType: env.TCS_SERVICE_TYPE || 'OverNight',
    shipmentType: env.SHIPMENT_TYPE || 'ECOM',
    paymentType: env.PAYMENT_TYPE || 'PAID',
    totalPackages: totalQty,
    totalAmount,
    remarks: `Shopify order ${clientReferenceNo}`,
    lineItems
  };
}

function extractValue(response, keys) {
  if (!response) return undefined;
  for (const key of keys) {
    if (response[key]) return response[key];
    if (response.data && response.data[key]) return response.data[key];
  }
  return undefined;
}

function buildErrorMessage(error, fallback) {
  if (!error) return fallback;
  if (error.response) {
    const status = error.response.status;
    const data = typeof error.response.data === 'object' ? JSON.stringify(error.response.data) : String(error.response.data || '');
    return `${fallback} (HTTP ${status}): ${data}`;
  }
  if (error.request) {
    return `${fallback}: no response from TCS`;
  }
  return `${fallback}: ${error.message || error}`;
}

export function makeTcs(env) {
  const disabled = boolEnv(env.TCS_DISABLED);
  const http = axiosModule?.create
    ? axiosModule.create({
        baseURL: env.TCS_BASE_URL,
        timeout: 20000,
        headers: {
          Authorization: `Bearer ${env.TCS_BEARER}`,
          'Content-Type': 'application/json'
        }
      })
    : null;
  const baseURL = (env.TCS_BASE_URL || '').replace(/\/$/, '');

  const endpoints = {
    consignee: env.TCS_CONSIGNEE_PATH || '/wms-edi/consignee',
    so: env.TCS_SO_PATH || '/wms-edi/so',
    gin: env.TCS_GIN_PATH || '/wms-edi/gin',
    cn: env.TCS_CN_PATH || '/wms-edi/cn'
  };

  async function request(config, fallbackLabel) {
    if (disabled) {
      return { ok: true, disabled: true };
    }
    try {
      if (http) {
        const { data } = await http.request(config);
        return data;
      }
      const relative = config.url || '/';
      const fullUrl = relative.startsWith('http')
        ? relative
        : `${baseURL || ''}${relative.startsWith('/') ? '' : '/'}${relative}`;
      if (!fullUrl) {
        const error = new Error(fallbackLabel);
        error.response = { status: 0, data: 'TCS_BASE_URL not configured' };
        throw error;
      }
      const url = new URL(fullUrl);
      if (config.params) {
        Object.entries(config.params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            url.searchParams.append(key, value);
          }
        });
      }
      const init = {
        method: (config.method || 'get').toUpperCase(),
        headers: {
          Authorization: `Bearer ${env.TCS_BEARER}`,
          'Content-Type': 'application/json'
        }
      };
      if (config.data) {
        init.body = JSON.stringify(config.data);
      } else if (init.method === 'POST') {
        init.body = JSON.stringify({});
      }
      const res = await fetch(url, init);
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (!res.ok) {
        const error = new Error(fallbackLabel);
        error.response = { status: res.status, data };
        throw error;
      }
      return data;
    } catch (err) {
      throw new Error(buildErrorMessage(err, fallbackLabel));
    }
  }

  async function ensureConsignee(order) {
    if (env.TEST_CONSIGNEE_CODE) {
      return { consigneeCode: env.TEST_CONSIGNEE_CODE, source: 'env' };
    }
    if (disabled) {
      const fake = `TEST-${Date.now()}`;
      return { consigneeCode: fake, disabled: true, payload: buildConsigneePayload(order, env) };
    }
    const payload = buildConsigneePayload(order, env);
    const response = await request({ method: 'post', url: endpoints.consignee, data: payload }, 'Failed to create consignee');
    const consigneeCode = extractValue(response, ['consigneeCode', 'code', 'ConsigneeCode']);
    if (!consigneeCode) throw new Error('TCS did not return consigneeCode');
    return { ...response, consigneeCode };
  }

  async function createSalesOrder(order, consigneeCode, clientReferenceNo) {
    const payload = buildSalesOrderPayload(order, consigneeCode, clientReferenceNo, env);
    if (disabled) {
      return { soNo: `SO-${Date.now()}`, disabled: true, payload };
    }
    const response = await request({ method: 'post', url: endpoints.so, data: payload }, 'Failed to create sales order');
    const soNo = extractValue(response, ['soNo', 'soNumber', 'SONumber', 'orderNo']);
    if (!soNo) throw new Error('TCS did not return soNo');
    return { ...response, soNo };
  }

  async function fetchGin(soNo, clientReferenceNo) {
    const params = {};
    if (soNo) params.soNo = soNo;
    if (clientReferenceNo) params.clientReferenceNo = clientReferenceNo;
    if (disabled) {
      return null;
    }
    const response = await request({ method: 'get', url: endpoints.gin, params }, 'Failed to fetch GIN');
    if (Array.isArray(response)) {
      return response[0] || null;
    }
    return response || null;
  }

  async function fetchCn(soNo, ginNo, clientReferenceNo) {
    const params = {};
    if (soNo) params.soNo = soNo;
    if (ginNo) params.ginNo = ginNo;
    if (clientReferenceNo) params.clientReferenceNo = clientReferenceNo;
    if (disabled) {
      return ginNo ? { cnNo: `CN-${ginNo}` } : null;
    }
    const response = await request({ method: 'get', url: endpoints.cn, params }, 'Failed to fetch CN');
    if (Array.isArray(response)) {
      return response[0] || null;
    }
    return response || null;
  }

  return {
    ensureConsignee,
    createSalesOrder,
    fetchGin,
    fetchCn
  };
}
