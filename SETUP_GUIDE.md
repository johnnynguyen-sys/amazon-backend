# 🛒 Amazon SP-API Setup Guide
### For sellers with an Amazon Seller Account (no developer account yet)

---

## ✅ What You Need Before Starting
- Active Amazon Seller Central account
- A computer with Node.js installed (https://nodejs.org — download LTS version)
- About 30–60 minutes

---

## STEP 1 — Register as an Amazon Developer (Free)

1. Go to: https://developer.amazonservices.com
2. Click **"Sign in"** using your **Amazon Seller account email & password**
3. Fill in your developer profile:
   - Developer name: your business name
   - Developer type: select **"I represent a company"** or **"Individual"**
   - Use case: select **"I'm developing for my own seller account"**
4. Agree to the terms and click **Register**

✅ You now have a developer account linked to your seller account.

---

## STEP 2 — Create an SP-API Application

1. In Seller Central, go to:
   **Apps & Services → Develop Apps**
2. Click **"Add new app client"**
3. Fill in:
   - App name: "My Dashboard" (or anything)
   - IAM ARN: leave blank for now (we'll fill this in Step 4)
4. Under **Roles**, check:
   - ✅ Direct Payments (for orders/sales)
   - ✅ Inventory and Order Management
   - ✅ Reports
   - ✅ Finance (optional, for financial reports)
5. Click **Save and exit**

---

## STEP 3 — Get Your LWA (Login with Amazon) Credentials

1. Go to: https://developer.amazon.com/loginwithamazon/console/site/lwa/overview.html
2. Click **"Create a New Security Profile"**
3. Fill in any name/description (e.g., "My Seller Dashboard")
4. Click **Save**
5. On the security profile, click **"Show Client ID and Client Secret"**
6. Copy both values — add them to your `.env` file:
   ```
   LWA_CLIENT_ID=amzn1.application-oa2-client.XXXXXXXXX
   LWA_CLIENT_SECRET=XXXXXXXXXXXXXXXXXXXXXXXXX
   ```

---

## STEP 4 — Create an AWS IAM User (Free)

The SP-API uses AWS to sign requests. You need an IAM user.

1. Go to: https://console.aws.amazon.com/iam
   (Create a free AWS account if you don't have one — it's free for this use case)
2. Click **Users → Add users**
3. Username: "sp-api-user" 
4. Select **"Access key - Programmatic access"**
5. Click **Next: Permissions**
6. Select **"Attach existing policies directly"**
7. Search for and select: **AmazonSellerPartnerAPIRole** 
   (If not found, click "Create policy" and paste the policy from Step 4b below)
8. Click through to create the user
9. **IMPORTANT**: Copy the **Access Key ID** and **Secret Access Key** — shown only once!
10. Add to your `.env`:
    ```
    AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
    AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
    ```

### Step 4b — IAM Policy (if AmazonSellerPartnerAPIRole not found)
Create a custom policy with this JSON:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:*:*:*"
    }
  ]
}
```

---

## STEP 5 — Get Your SP-API Refresh Token

1. Go back to Seller Central → **Apps & Services → Develop Apps**
2. Find your app and click **"Authorize"**
3. This will generate a **Refresh Token** (starts with `Atzr|...`)
4. Copy it and add to `.env`:
   ```
   SP_API_REFRESH_TOKEN=Atzr|XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```

---

## STEP 6 — Find Your Marketplace ID

| Country        | Marketplace ID     |
|--------------- |--------------------|
| 🇺🇸 United States | ATVPDKIKX0DER   |
| 🇨🇦 Canada        | A2EUQ1WTGCTBG2  |
| 🇬🇧 United Kingdom | A1F83G8C2ARO7P |
| 🇩🇪 Germany       | A1PA6795UKMFR9  |
| 🇫🇷 France        | A13V1IB3VIYZZH  |
| 🇮🇹 Italy         | APJ6JRA9NG5V4   |
| 🇪🇸 Spain         | A1RKKUPIHCS9HS  |
| 🇯🇵 Japan         | A1VC38T7YXB528  |
| 🇦🇺 Australia     | A39IBJ37TRP1C6  |
| 🇮🇳 India         | A21TJRUUN4KGV   |
| 🇲🇽 Mexico        | A1AM78C64UM0Y8  |

Add to `.env`:
```
SP_API_MARKETPLACE_ID=ATVPDKIKX0DER
SP_API_REGION=us-east-1
```

---

## STEP 7 — Find Your Seller ID (optional, for listings)

1. In Seller Central, go to **Account Info**
2. Your Seller ID is shown under "Merchant Token"
3. Add to `.env`:
   ```
   SELLER_ID=AXXXXXXXXX
   ```

---

## STEP 8 — Configure and Start the Backend

1. Open a terminal/command prompt
2. Navigate to the backend folder:
   ```bash
   cd amazon-backend
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy the example env file and fill in your credentials:
   ```bash
   cp .env.example .env
   # Then open .env in any text editor and fill in all REPLACE_ME values
   ```
5. Start the server:
   ```bash
   npm start
   ```
6. Test the connection:
   Open your browser and go to:
   ```
   http://localhost:3001/api/auth/status
   ```
   You should see:
   ```json
   { "connected": true, "message": "✅ All systems connected — SP-API is ready!" }
   ```

---

## STEP 9 — Connect the Frontend Dashboard

Open your `amazon-dashboard.html` file in a browser.
The dashboard will automatically call `http://localhost:3001/api/...` for live data.

---

## 🔧 Troubleshooting

| Error | Fix |
|-------|-----|
| `invalid_client` | Check LWA_CLIENT_ID and LWA_CLIENT_SECRET |
| `invalid_grant` | Refresh token expired — re-authorize in Seller Central |
| `403 Forbidden` | IAM permissions not set up correctly |
| `CORS error` | Backend not running, or wrong FRONTEND_URL in .env |
| `InvalidSignature` | Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY |

---

## 📞 Need Help?

- SP-API Documentation: https://developer-docs.amazon.com/sp-api/
- Seller Central Help: https://sellercentral.amazon.com/help
- SP-API GitHub: https://github.com/amzn/selling-partner-api-docs
