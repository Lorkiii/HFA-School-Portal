# Render Deployment Guide - Quick & Easy

**Total Time:** ~20 minutes | **Difficulty:** Easy

Render is a modern platform that auto-deploys from GitHub. Much easier than Hostinger!

---

## Prerequisites ✅

- [ ] GitHub account
- [ ] Your code pushed to GitHub repository
- [ ] Gmail App Password ready
- [ ] Firebase `serviceAccountKey.json` ready

---

## Step 1: Prepare Your Code (5 minutes)

### 1.1 Push to GitHub

If not already on GitHub:

```bash
# Initialize git (if needed)
git init

# Add all files
git add .

# Commit
git commit -m "Ready for deployment"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

### 1.2 Add Firebase Credentials as Base64

Since Render doesn't support file uploads easily, we'll convert `serviceAccountKey.json` to base64:

**Windows PowerShell:**
```powershell
$content = Get-Content server\serviceAccountKey.json -Raw
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content)) | Out-File firebase-base64.txt
```

**Command Prompt:**
```bash
certutil -encode server\serviceAccountKey.json firebase-base64.txt
```

This creates `firebase-base64.txt` - you'll paste this into Render environment variables.

---

## Step 2: Update Your Code for Render (5 minutes)

### 2.1 Update server.mjs to Support Base64 Firebase Credentials

I'll update this for you automatically - see below for the code change.

### 2.2 Update CORS (You'll do this after getting Render URL)

You'll add your Render URL later.

---

## Step 3: Deploy on Render (10 minutes)

### 3.1 Create Render Account

1. Go to https://render.com
2. Sign up with GitHub (easiest option)
3. Authorize Render to access your repositories

### 3.2 Create New Web Service

1. Click **"New +"** → **"Web Service"**
2. Select **"Build and deploy from a Git repository"**
3. Click **"Connect"** next to your repository
   - If you don't see it, click "Configure account" to grant access

### 3.3 Configure Service

**Name:** `hfa-school-portal` (or any name you prefer)

**Region:** Choose closest to your users (e.g., Singapore, Oregon)

**Branch:** `main`

**Root Directory:** Leave blank

**Runtime:** `Node`

**Build Command:**
```
npm install
```

**Start Command:**
```
npm start
```

**Plan:** Select **Free** (good for testing) or **Starter** ($7/month - recommended)

### 3.4 Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"**

Add each variable:

```
Key: JWT_SECRET
Value: your_jwt_secret_here

Key: SMTP_USER
Value: your-email@gmail.com

Key: SMTP_PASS
Value: your-gmail-app-password

Key: NODE_ENV
Value: production

Key: PORT
Value: 3000

Key: FIREBASE_SERVICE_ACCOUNT_BASE64
Value: (paste contents from firebase-base64.txt)
```

**Important:** For `FIREBASE_SERVICE_ACCOUNT_BASE64`:
- Open `firebase-base64.txt`
- Copy ALL the text
- Paste into Render (it will be very long - that's normal!)

### 3.5 Deploy

1. Click **"Create Web Service"**
2. Render will automatically:
   - Clone your repository
   - Run `npm install`
   - Start your server
   - Give you a URL like `https://hfa-school-portal.onrender.com`

3. Watch the logs - deployment takes 2-5 minutes

---

## Step 4: Post-Deployment Configuration (5 minutes)

### 4.1 Update CORS with Your Render URL

Once deployed, you'll get a URL like: `https://hfa-school-portal.onrender.com`

**Option A: Update in GitHub and Redeploy**
1. Edit `server/server.mjs` line 86
2. Add your Render URL to CORS origins
3. Push to GitHub
4. Render auto-deploys

**Option B: Quick Fix via Render Dashboard**
1. Go to Render Dashboard → Your Service → Shell
2. Edit the file directly (advanced)

### 4.2 Update Firebase Authorized Domains

1. Go to Firebase Console → Authentication → Settings
2. Add authorized domain: `hfa-school-portal.onrender.com`
3. Click "Add Domain"

### 4.3 Test Your Application

Visit your Render URL:
- Landing page: `https://your-app.onrender.com/main.html`
- Admin portal: `https://your-app.onrender.com/adminportal/admin.html`

---

## Render Features 🎉

**Included FREE on Render:**
- ✅ Automatic HTTPS/SSL certificate
- ✅ Auto-deploy on Git push
- ✅ Environment variable management
- ✅ Health checks and monitoring
- ✅ Logs and metrics dashboard
- ✅ Zero-downtime deploys

**Paid Plans ($7/month):**
- Better performance (no cold starts)
- More compute hours
- Background workers
- Priority support

---

## Comparison: Render vs Hostinger

| Feature | Render | Hostinger |
|---------|--------|-----------|
| **Setup Time** | 20 min | 2 hours |
| **Deployment** | Git push = auto-deploy | Manual FTP upload |
| **SSL Certificate** | Automatic & free | Manual setup |
| **Scaling** | Automatic | Manual |
| **Monitoring** | Built-in dashboard | Basic |
| **Cost (Basic)** | $0 (Free tier) | $3-5/month |
| **Cost (Pro)** | $7/month | $5-10/month |
| **Best For** | Modern apps | Traditional hosting |

**Winner:** Render (for Node.js apps) 🏆

---

## Important Notes

### Free Tier Limitations:
- App spins down after 15 minutes of inactivity
- Cold start takes 30-60 seconds on first request
- 750 hours/month free compute time

**Solution:** Upgrade to Starter plan ($7/month) for always-on service

### Cron Jobs:
- Work on Free and Starter plans
- No additional configuration needed
- Your scheduled tasks will run automatically

---

## Troubleshooting

### Error: "Cannot find module"
**Fix:** Check that `package.json` has correct start command: `node server/server.mjs`

### Error: Firebase authentication failed
**Fix:** Verify `FIREBASE_SERVICE_ACCOUNT_BASE64` is set correctly in environment variables

### Error: CORS policy blocking requests
**Fix:** Update CORS origins in `server/server.mjs` with your Render URL

### Error: Email not sending
**Fix:** Check `SMTP_USER` and `SMTP_PASS` environment variables are correct

---

## Updating Your Application

### To deploy updates:
```bash
# Make your changes
git add .
git commit -m "Your update message"
git push

# Render auto-deploys! ✨
```

That's it! No manual upload, no FTP, just push to Git.

---

## Custom Domain (Optional)

Want to use your own domain like `holyfamilyacademy.com`?

1. Purchase domain from Hostinger, Namecheap, etc.
2. In Render: Settings → Custom Domain → Add Domain
3. Update DNS records (Render shows you what to add)
4. Wait 5-10 minutes for DNS propagation
5. SSL certificate auto-generated

**Cost:** Domain only (~$10-15/year), Render domain is free

---

## Next Steps

1. ✅ Deploy to Render
2. ✅ Test all features
3. ✅ Update CORS with Render URL
4. ✅ Add Firebase authorized domain
5. ✅ Share URL with stakeholders
6. ✅ Monitor logs for first week

---

## Support

**Render Documentation:** https://render.com/docs
**Render Community:** https://community.render.com
**Status Page:** https://status.render.com

Good luck! 🚀
