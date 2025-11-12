# TCS–Shopify Bridge (WMS-EDI)

A minimal microservice that:
- Receives Shopify orders → creates Consignee (if needed) + SO in TCS WMS-EDI
- Polls twice daily for GIN/CN → creates Shopify Fulfillment with TCS tracking
- Sends emails to Admin/Sales on each step and on errors

## Quick Start (Windows PowerShell)

1) Unzip the project anywhere (e.g., `C:\tcs-shopify-bridge`).
2) Install Node 18+ and run:
   ```powershell
   cd C:\tcs-shopify-bridge
   npm install
   ```
3) Copy `.env.example` to `.env` and fill in **all** values (especially `TCS_BEARER`).  
   The JWT must be RAW (no angle brackets).
4) Start:
   ```powershell
   npm run dev
   ```
5) Health checks:
   - `GET http://localhost:8090/debug/env`
   - `GET http://localhost:8090/shipments` (local queue/store)
6) Test order → SO (without Shopify):
   ```powershell
   $body = @{
     name = "#1003"
     email = "customer@example.com"
     shipping_address = @{
       first_name = "Ali"; last_name = "Khan"
       address1   = "House 10"; address2 = "Phase 1"
       city       = "Karachi";  phone    = "03001234567"
     }
     line_items = @(@{ sku = "UAT-SKU-001"; quantity = 1; price = "2500" })
   } | ConvertTo-Json -Depth 5

   Invoke-RestMethod -Uri "http://localhost:8090/test/so" -Method Post `
     -ContentType "application/json" -Body $body
   ```

## Shopify Webhook (Orders Create)
Point this URL in Shopify Admin → Notifications → Webhooks (Orders create):
- `POST https://YOUR_PUBLIC_HOST/webhooks/shopify/orders/create`

Set your **SHOPIFY_WEBHOOK_SECRET** in `.env` to enable HMAC verification.

## What it stores
A small JSON file `data/shipments.json` keeps pending SOs, and later GIN/CN so they can be fulfilled.

## Cron
Twice daily (default 11:00 and 18:00 Asia/Karachi), the bridge will:
- For any record with SO but missing GIN/CN → fetch GIN (GIN API), then fetch CN (CN API).
- When CN arrives, it makes a Shopify Fulfillment.

## Notes
- If your WMS-EDI `/so` requires `consigneeCode`, set `TEST_CONSIGNEE_CODE` **or** ensureConsignee will attempt to POST /consignee first and then try `/so` with the generated `consigneeCode`.
- All TCS endpoints are called against `TCS_BASE_URL` as per your `MODE=WMS-EDI` setup.
