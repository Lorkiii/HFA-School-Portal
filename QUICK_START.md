# Quick Start - Hostinger Deployment

**Total Time:** ~2 hours | **Difficulty:** Medium

## Before You Start ⚠️

You MUST have:
1. ✅ Hostinger **Business** or higher plan (has Node.js)
2. ✅ Gmail App Password ready
3. ✅ Firebase serviceAccountKey.json file

**Don't have these?** Stop and get them first!

---

## The 5-Step Process

### Step 1: Prepare (15 min)

1. **Create `.env` file** in project root:
```env
JWT_SECRET=run_this_in_terminal_to_generate_secret
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-16-char-app-password
NODE_ENV=production
PORT=3000
```

**Generate JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

2. **Get Gmail App Password:**
   - Go to: https://myaccount.google.com/apppasswords
   - Create password for "Mail"
   - Copy the 16-character code

3. **Verify Firebase file:**
   - Check `server/serviceAccountKey.json` exists

---

### Step 2: Upload to Hostinger (30 min)

1. **Login:** Go to https://hpanel.hostinger.com

2. **Open File Manager:**
   - Click "File Manager"
   - Navigate to `public_html/`

3. **Upload ALL files EXCEPT:**
   - ❌ `node_modules/` folder
   - ❌ `.git/` folder
   - ❌ `.env` file

4. **Verify structure:**
```
public_html/
├── adminportal/
├── server/
│   └── serviceAccountKey.json ← CHECK THIS!
├── package.json ← CHECK THIS!
└── main.html
```

---

### Step 3: Create Node.js App (20 min)

1. **In Hostinger, go to:** Advanced → Node.js

2. **Click "Create Application"**

3. **Fill form:**
   - Mode: `Production`
   - Root: `/home/YOUR_USERNAME/public_html`
   - Startup File: `server/server.mjs`
   - Node Version: `18.x` or newer

4. **Add Environment Variables:**
   Click "Add Variable" for each:
   ```
   JWT_SECRET = (your generated secret)
   SMTP_USER = your-email@gmail.com
   SMTP_PASS = (your 16-char app password)
   NODE_ENV = production
   ```

5. **Install Dependencies:**
   - Click "Run NPM Install"
   - Wait 3-5 minutes

6. **Start Application:**
   - Click "Start Application"
   - Wait for green "Running" status

---

### Step 4: Configure Domain & SSL (15 min)

1. **Update CORS:**
   - File Manager → `server/server.mjs`
   - Line 86: Add your domain:
   ```javascript
   origin: ["https://your-domain.com", "https://www.your-domain.com"]
   ```
   - Save file
   - Restart Node.js app

2. **Install SSL:**
   - Hostinger → SSL section
   - Click "Install SSL" for your domain
   - Wait 5-10 minutes

3. **Update Firebase:**
   - Firebase Console → Authentication → Settings
   - Add authorized domain: `your-domain.com`

---

### Step 5: Test Everything (20 min)

Visit: `https://your-domain.com`

**Quick Tests:**
- [ ] Landing page loads
- [ ] Go to `/adminportal/admin.html`
- [ ] Login with admin credentials
- [ ] Check if OTP email arrives (check spam!)
- [ ] Enter OTP and access dashboard
- [ ] Try uploading an announcement with image
- [ ] Test on mobile phone

**If anything fails:** Check logs in Hostinger Node.js panel

---

## Common Issues & Quick Fixes

### ❌ "Cannot GET /"
**Fix:** Check startup file is `server/server.mjs`

### ❌ CORS Error
**Fix:** Update origins in server.mjs, restart app

### ❌ No OTP Email
**Fix:** 
- Check spam folder
- Verify SMTP_PASS is App Password
- Check environment variables in Hostinger

### ❌ Firebase Error
**Fix:** Verify `serviceAccountKey.json` is in `server/` folder

### ❌ 500 Error
**Fix:** View logs in Hostinger Node.js panel, fix error shown

---

## Success! What's Next?

Your app is live! Now:

1. **Save your credentials** securely
2. **Set up backups** in Hostinger
3. **Monitor logs** for first week
4. **Share the URL** with your stakeholders

---

## Need Detailed Guide?

Open `HOSTINGER_STEP_BY_STEP.md` for:
- Screenshots descriptions
- Detailed explanations
- Troubleshooting section
- Full testing checklist

---

## Support Resources

- **Hostinger:** Chat support in hpanel (bottom right)
- **Your Logs:** Hostinger → Node.js → Your App → View Logs
- **Firebase:** console.firebase.google.com

---

**Remember:** First deployment takes 2 hours. Updates take 5 minutes!

Good luck! 🚀
