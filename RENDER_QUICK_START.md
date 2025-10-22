# Render Deployment - Quick Start Guide

**Time:** 20 minutes | **Easier than Hostinger!**

---

## Step 1: Convert Firebase Credentials (2 min)

Run this command in your project root:

```bash
node scripts/convert-firebase-to-base64.js
```

This creates `firebase-base64.txt` with your encoded credentials.

---

## Step 2: Push to GitHub (3 min)

```bash
git add .
git commit -m "Ready for Render deployment"
git push
```

---

## Step 3: Deploy on Render (10 min)

### 3.1 Go to https://render.com
- Sign up with GitHub
- Click "New +" → "Web Service"
- Connect your repository

### 3.2 Configure Service

**Build Command:**
```
npm install
```

**Start Command:**
```
npm start
```

### 3.3 Add Environment Variables

Click "Advanced" → Add these 6 variables:

```
JWT_SECRET = (your secret from .env)
SMTP_USER = (your gmail)
SMTP_PASS = (your gmail app password)
NODE_ENV = production
PORT = 3000
FIREBASE_SERVICE_ACCOUNT_BASE64 = (paste from firebase-base64.txt)
```

### 3.4 Click "Create Web Service"

Render will:
- Install dependencies
- Start your server
- Give you a URL like `https://your-app.onrender.com`

⏱️ Wait 3-5 minutes for deployment

---

## Step 4: Update CORS (3 min)

1. Copy your Render URL (e.g., `https://your-app.onrender.com`)
2. Edit `server/server.mjs` line 98
3. Add your URL:

```javascript
origin: [
  "https://your-app.onrender.com",  // ← Add this
  "http://localhost:3000"
],
```

4. Push to GitHub:
```bash
git add .
git commit -m "Update CORS for Render"
git push
```

Render auto-deploys! ✨

---

## Step 5: Update Firebase (2 min)

1. Go to Firebase Console → Authentication → Settings
2. Add authorized domain: `your-app.onrender.com`
3. Save

---

## 🎉 Done! Test Your App

Visit: `https://your-app.onrender.com/main.html`

**Test:**
- ✅ Landing page loads
- ✅ Admin login works
- ✅ OTP email arrives
- ✅ Dashboard accessible
- ✅ File uploads work

---

## 🚀 Benefits of Render

✅ Auto-deploy on Git push
✅ Free HTTPS/SSL
✅ Easy environment variables
✅ Built-in monitoring
✅ No FTP uploads needed

**Cost:** Free tier available, or $7/month for production

---

## Render vs Hostinger

| | Render | Hostinger |
|---|--------|-----------|
| Setup | 20 min | 2 hours |
| Deploy | Git push | Manual FTP |
| SSL | Automatic | Manual |
| Updates | Git push | Re-upload files |
| Cost | Free/$7 | $3-5/month |

**Render wins for Node.js!** 🏆

---

## Troubleshooting

**Build fails?**
- Check `package.json` has correct start command
- View build logs in Render dashboard

**App not starting?**
- Check environment variables are set
- View logs: Render dashboard → Logs

**CORS error?**
- Update CORS in server.mjs with Render URL
- Push to GitHub to redeploy

---

## Need Help?

See full guide: `RENDER_DEPLOYMENT.md`

Good luck! 🎉
