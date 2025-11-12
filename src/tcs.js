import axios from 'axios';

export function makeTcs(env) {
  const http = axios.create({
    baseURL: env.TCS_BASE_URL,
    timeout: 20000,
    headers: {
      Authorization: `Bearer ${env.TCS_BEARER}`,
      'Content-Type': 'application/json'
    }
  });

  async function ping() {
    try { const { status } = await http.get('/'); return status; }
    catch (e) { return e?.response?.status || 0; }
  }

  // TODO: replace with real API integration
  async function createCNFromOrder(order) {
    return { ok: true, consignmentNumber: 'UAT-' + (order?.id || Date.now()) };
  }

  return { ping, createCNFromOrder };
}
