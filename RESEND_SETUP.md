# Resend API Setup for Production (Railway)

## ✅ Why Resend is Better Than Gmail SMTP

- **No connection timeouts** - API-based, not SMTP protocol
- **Better deliverability** - Designed for transactional emails
- **Simpler setup** - Just an API key, no App Password needed
- **Production-ready** - Used by thousands of companies
- **Free tier** - 3,000 emails/month (enough for most schools)
- **Better logging** - Track email delivery status

---

## Step 1: Get Your Resend API Key

### Option A: If You Already Have a Resend Account

1. Go to https://resend.com/login
2. Sign in to your account
3. Go to **API Keys** in the left sidebar
4. Copy your existing API key (starts with `re_`)

### Option B: Create New Resend Account (Free)

1. Go to https://resend.com/signup
2. Sign up with your email
3. Verify your email address
4. Go to **API Keys** → Click **Create API Key**
5. Name it "Railway HFA Production"
6. Copy the API key (starts with `re_`)
   - ⚠️ **IMPORTANT:** Copy it NOW - you can't see it again!

---

## Step 2: Set Up Email Domain (Important!)

### Option A: Use Resend's Test Domain (Quick Start)

For testing/development, you can use Resend's default domain:
- **From email:** `onboarding@resend.dev`
- **Limitations:** Emails only work to YOUR registered email
- **Good for:** Testing before going live

### Option B: Add Your Own Domain (Recommended for Production)

1. Go to **Domains** in Resend dashboard
2. Click **Add Domain**
3. Enter your school domain (e.g., `holyfamilyacademy.edu`)
4. Follow DNS setup instructions (add MX, TXT, CNAME records)
5. Wait for verification (usually 5-15 minutes)
6. Use your domain: `noreply@holyfamilyacademy.edu`

**Don't have a domain?** You can:
- Use Resend's test domain for now
- Buy a cheap domain ($12/year) from Namecheap or Google Domains
- Use your school's existing domain (ask IT admin)

---

## Step 3: Configure Railway Environment Variables

In your Railway project:

1. Go to your project → **Variables** tab
2. Click **New Variable**
3. Add these variables:

```bash
# Resend API Configuration (REQUIRED)
RESEND_API_KEY=re_your_api_key_here_from_step_1

# From Email Address (REQUIRED)
RESEND_FROM_EMAIL=onboarding@resend.dev
# OR if you verified your own domain:
# RESEND_FROM_EMAIL=noreply@holyfamilyacademy.edu

# Other Required Variables
NODE_ENV=production
JWT_SECRET=your-secure-random-string-at-least-32-chars

# Firebase Configuration (REQUIRED)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Key-Here\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com

# Optional
PORT=3000
```

4. Click **Save** or **Deploy** to apply changes
5. Railway will automatically redeploy your app

---

## Step 4: Verify Setup

### After Railway Redeploys:

1. **Check Railway Logs** for:
   ```
   ✅ Resend API initialized and ready to send emails
   ```

2. **Test the API** by visiting:
   ```
   https://your-app.up.railway.app/test-email
   ```
   
   You should see:
   ```json
   {
     "success": true,
     "message": "Resend API connection successful",
     "provider": "Resend"
   }
   ```

3. **Test Login OTP:**
   - Go to your login page
   - Enter your email
   - Check your inbox for OTP code
   - Look in Railway logs for:
     ```
     [/auth/login] ✅ OTP email sent to user@email.com
     ```

---

## Troubleshooting

### ❌ "RESEND_API_KEY not configured"

**Fix:** Make sure you added `RESEND_API_KEY` to Railway Variables and redeployed.

### ❌ "403 Forbidden" or "Domain not verified"

**Fix:** 
- If using `onboarding@resend.dev`, make sure emails are sent to YOUR registered email
- If using your own domain, verify it's properly set up in Resend dashboard

### ❌ Emails not arriving

**Check:**
1. Spam/Junk folder
2. Resend dashboard → **Emails** → Check delivery status
3. Railway logs for error messages
4. Make sure `RESEND_FROM_EMAIL` is set correctly

### ❌ "Invalid API key"

**Fix:**
- Double-check the API key in Railway Variables
- Make sure you copied the FULL key (starts with `re_`)
- Try regenerating the API key in Resend dashboard

---

## What Changed in the Code

All email sending now uses **Resend API** instead of Gmail SMTP:

1. **Import:** `nodemailer` → `resend`
2. **No SMTP connection** - Direct API calls
3. **Faster** - No connection timeouts
4. **More reliable** - Better error messages
5. **Backward compatible** - All existing router code works

---

## Email Limits (Free Tier)

- **3,000 emails/month** - Free forever
- **100 emails/day** - Default limit
- **Need more?** Upgrade to paid plan ($20/month for 50,000 emails)

For a typical school with 50 logins/day:
- 50 OTP emails = **1,500/month** ✅ Well within free tier

---

## Testing in Development (localhost)

Your `.env` file should have:

```bash
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=onboarding@resend.dev
NODE_ENV=development
```

Start your server:
```bash
npm start
```

You should see:
```
✅ Resend API initialized and ready to send emails
✅ Server running on: http://localhost:3000
```

---

## Support & Documentation

- **Resend Docs:** https://resend.com/docs
- **Email Logs:** https://resend.com/emails (see all sent emails)
- **Domain Setup:** https://resend.com/docs/dashboard/domains/introduction
- **API Reference:** https://resend.com/docs/api-reference/emails/send-email

---

## Migration Complete! 🎉

Your app now uses Resend API for all email sending:
- ✅ Login OTP emails
- ✅ Resend OTP emails  
- ✅ Teacher application emails
- ✅ Admin notification emails
- ✅ All router-based emails

**No more Gmail SMTP connection timeouts!**
