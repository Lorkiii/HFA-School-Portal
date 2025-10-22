# Hostinger Deployment Tutorial - Complete Guide

## 📋 What You'll Need Before Starting

- [ ] Hostinger account (sign up at hostinger.com)
- [ ] Business or Premium hosting plan (includes Node.js support)
- [ ] Your Firebase `serviceAccountKey.json` file
- [ ] Gmail account with App Password ready
- [ ] Your project files

**Time needed:** About 30-45 minutes

---

## Part 1: Prepare Your Application (DO THIS FIRST!)

### Step 1: Create Your .env File

1. In your project folder, create a new file named `.env` (exactly like that, starting with a dot)
2. Copy this template and fill in YOUR details:

```env
JWT_SECRET=CHANGE_THIS_TO_A_LONG_RANDOM_STRING_MIN_32_CHARACTERS
SMTP_USER=your-school-email@gmail.com
SMTP_PASS=your-gmail-app-password-here
NODE_ENV=production
PORT=3000
```

**How to fill each field:**

**JWT_SECRET:** 
- Open Command Prompt or PowerShell
- Run this command:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Copy the output and paste as JWT_SECRET value

**SMTP_USER:** Your Gmail address (e.g., `holyfamilyacademy@gmail.com`)

**SMTP_PASS:** Gmail App Password (NOT your regular password!)
- Go to https://myaccount.google.com/apppasswords
- Sign in to your Google account
- Create a new App Password for "Mail"
- Copy the 16-character password
- Paste it in SMTP_PASS (no spaces)

### Step 2: Get Your Firebase Credentials

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project
3. Click the gear icon ⚙️ → Project Settings
4. Go to "Service Accounts" tab
5. Click "Generate New Private Key"
6. Save the file as `serviceAccountKey.json`
7. **IMPORTANT:** This file should be in your `server/` folder

### Step 3: Update CORS for Production

Open `server/server.mjs` and find lines 84-89. You'll update this AFTER you get your domain.

```javascript
app.use(
  cors({
    origin: [
      "https://your-actual-domain.com",  // ← You'll add this later
      "https://www.your-actual-domain.com",  // ← And this
      "http://127.0.0.1:5500", // Keep for local testing
      "http://localhost:3000"  // Keep for local testing
    ],
    credentials: true,
  })
);
```

---

## Part 2: Set Up Hostinger Account

### Step 4: Purchase Hosting Plan

1. Go to https://www.hostinger.com
2. Click "Hosting" → "Premium Web Hosting" or "Business Web Hosting"
   - **Important:** You NEED Business plan or higher for Node.js support
3. Choose your plan:
   - **Business Plan** ($3.99/mo) - Good for school projects ✅
   - **Cloud Startup** ($8.99/mo) - Better performance
4. During checkout:
   - Choose or register a domain name (e.g., `holyfamilyacademy.com`)
   - Or select "I'll use my existing domain"
5. Complete payment

### Step 5: Access Your Control Panel

1. After purchase, check your email for login details
2. Go to https://hpanel.hostinger.com
3. Log in with your credentials
4. You'll see your hosting dashboard

---

## Part 3: Upload Your Files

### Step 6: Prepare Files for Upload

**DO NOT upload these folders/files:**
- ❌ `node_modules/` folder (too large, will install on server)
- ❌ `.git/` folder (not needed)
- ❌ `.env` file (we'll set these separately)
- ❌ Any local test files

**DO upload everything else:**
- ✅ All your project folders (adminportal, server, login, etc.)
- ✅ `package.json` and `package-lock.json`
- ✅ All HTML, CSS, JS files
- ✅ `assets/` folder
- ✅ `serviceAccountKey.json` (inside server folder)

### Step 7: Upload via File Manager

1. In Hostinger panel, click **"File Manager"**
2. Navigate to `public_html/` folder (this is your website root)
3. Delete the default `index.html` if present
4. Click **"Upload Files"** button (top right)
5. Select ALL your project files and folders
6. Wait for upload to complete (may take 5-10 minutes)

**Folder Structure on Server should look like:**
```
public_html/
├── adminportal/
├── applicationform/
├── assets/
├── login/
├── server/
│   ├── routes/
│   ├── utils/
│   ├── templates/
│   ├── server.mjs
│   └── serviceAccountKey.json  ← MUST be here!
├── teacher-application/
├── main.html
├── package.json
├── package-lock.json
└── ... other files
```

---

## Part 4: Set Up Node.js Application

### Step 8: Create Node.js App in Hostinger

1. In Hostinger panel, go to **"Advanced"** → **"Node.js"**
2. Click **"Create Application"**
3. Fill in the form:

**Application Mode:** `Production`

**Application Root:** 
```
/home/username/public_html
```
(Replace `username` with your actual Hostinger username - check File Manager path)

**Application URL:** Choose your domain from dropdown

**Application Startup File:**
```
server/server.mjs
```

**Node.js Version:** Select `18.x` or `20.x` (latest available)

4. Click **"Create"**

### Step 9: Set Environment Variables

Still in the Node.js app settings:

1. Scroll down to **"Environment Variables"** section
2. Click **"Add Variable"** for each:

```
Variable Name: JWT_SECRET
Value: (paste your JWT secret from .env file)

Variable Name: SMTP_USER
Value: your-email@gmail.com

Variable Name: SMTP_PASS
Value: (paste your Gmail App Password)

Variable Name: NODE_ENV
Value: production
```

3. Click "Save" after adding all variables

### Step 10: Install Dependencies

1. In the Node.js application panel, find **"Run NPM Install"** button
2. Click it and wait (this installs all packages from package.json)
3. Watch the progress - it may take 2-5 minutes
4. Wait until you see "Installation completed successfully"

**If you don't see this button:**
- Look for "Terminal" or "SSH Access" option
- Connect to SSH
- Navigate to your directory:
  ```bash
  cd public_html
  npm install --production
  ```

---

## Part 5: Configure Application

### Step 11: Update CORS Origins (IMPORTANT!)

1. In File Manager, open `server/server.mjs`
2. Find the CORS section (around line 84-89)
3. Click "Edit" button
4. Update the origins array with YOUR domain:

```javascript
app.use(
  cors({
    origin: [
      "https://holyfamilyacademy.com",      // ← Your actual domain
      "https://www.holyfamilyacademy.com",  // ← With www
      "http://localhost:3000"  // Keep for testing
    ],
    credentials: true,
  })
);
```

5. Click "Save & Close"

### Step 12: Verify serviceAccountKey.json

1. In File Manager, navigate to `server/` folder
2. Verify `serviceAccountKey.json` is there
3. Right-click the file → "Permissions"
4. Set permissions to `600` (Owner: Read+Write, Others: None)

---

## Part 6: Start Your Application

### Step 13: Start the Application

1. Go back to **"Node.js"** section in Hostinger
2. Find your application in the list
3. Click the **"Start Application"** button
4. Status should change to "Running" with a green indicator

### Step 14: Check Application Logs

1. In Node.js app panel, click **"View Logs"**
2. You should see:
   ```
   ✅ Server running on: http://localhost:3000
   ✅ Cron job scheduled: Teacher account auto-deletion
   ✅ Cron job scheduled: Archived messages auto-deletion
   ```

**If you see errors:**
- Check environment variables are set correctly
- Verify serviceAccountKey.json is in the right location
- Check Node.js version is 18+ 
- Review the error message and fix accordingly

---

## Part 7: Configure SSL (HTTPS)

### Step 15: Install SSL Certificate

1. In Hostinger panel, go to **"SSL"** section
2. Find your domain in the list
3. Click **"Install SSL"** (Free SSL from Let's Encrypt)
4. Wait 5-10 minutes for activation
5. Status will change to "Active"

### Step 16: Force HTTPS

1. In File Manager, go to `public_html/`
2. Look for `.htaccess` file (I created this for you!)
3. If it doesn't exist, click "New File" → name it `.htaccess`
4. Add this content:

```apache
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

5. Save the file

---

## Part 8: Update Firebase Settings

### Step 17: Add Authorized Domain in Firebase

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project
3. Go to **Authentication** → **Settings** → **Authorized Domains**
4. Click **"Add Domain"**
5. Add your Hostinger domain: `holyfamilyacademy.com`
6. Add with www: `www.holyfamilyacademy.com`
7. Click "Add"

### Step 18: Update Firebase Storage Rules

1. In Firebase Console, go to **Storage** → **Rules**
2. Make sure you have:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /announcement-images/{imageId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /message-attachments/{file} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

3. Click "Publish"

---

## Part 9: Test Your Application

### Step 19: Test Each Feature

Open your domain in a browser: `https://holyfamilyacademy.com`

**Test checklist:**

1. **Landing Page:**
   - [ ] Page loads without errors
   - [ ] Announcements and news display
   - [ ] Enrollment status shows correctly
   - [ ] Images load properly

2. **Admin Login:**
   - [ ] Go to `/adminportal/admin.html`
   - [ ] Enter admin credentials
   - [ ] Receive OTP email (check spam folder!)
   - [ ] Enter OTP and login successful
   - [ ] Dashboard loads with data

3. **Teacher Application:**
   - [ ] Go to `/teacher-application/teacher.html`
   - [ ] Fill out application form
   - [ ] Submit successfully
   - [ ] Receive confirmation email

4. **Student Enrollment:**
   - [ ] Go to `/applicationform/jhsform.html`
   - [ ] Fill out form
   - [ ] Submit successfully

5. **File Uploads:**
   - [ ] Upload announcement image in admin portal
   - [ ] Image displays correctly
   - [ ] Send message with attachment
   - [ ] Attachment downloads properly

6. **Mobile Test:**
   - [ ] Open on phone
   - [ ] Test responsive design
   - [ ] All features work on mobile

---

## Part 10: Troubleshooting Common Issues

### Issue 1: "Cannot GET /" or 404 Error

**Solution:**
- Check that `main.html` is in the root of `public_html/`
- In Node.js app settings, verify "Application Startup File" is `server/server.mjs`
- Check server logs for errors

### Issue 2: CORS Error in Browser Console

**Solution:**
- Update CORS origins in `server/server.mjs` with your actual domain
- Restart the Node.js application
- Clear browser cache (Ctrl+Shift+Delete)

### Issue 3: Firebase Authentication Error

**Solution:**
- Verify `serviceAccountKey.json` is in `server/` folder
- Check Firebase console that your domain is in Authorized Domains
- Verify Firebase project ID matches your config

### Issue 4: Emails Not Sending

**Solution:**
- Check SMTP_USER and SMTP_PASS in environment variables
- Use Gmail App Password, not regular password
- Check Gmail hasn't blocked the login (check security alerts)
- Look in spam folder

### Issue 5: "Module not found" Error

**Solution:**
- Run "NPM Install" again in Hostinger panel
- Check that `package.json` was uploaded
- Verify Node.js version is 18+

### Issue 6: Application Crashes or Won't Start

**Solution:**
- Check logs in Node.js panel
- Verify all environment variables are set
- Check for typos in environment variable names
- Restart the application

---

## Part 11: Post-Deployment Tasks

### Step 20: Set Up Monitoring

1. In Hostinger panel, enable error notifications
2. Check logs daily for the first week
3. Monitor Firebase quota usage

### Step 21: Backup Your Application

1. In Hostinger panel, go to **Backups**
2. Enable automated backups
3. Schedule: Weekly or Daily
4. Keep secure copy of `.env` file offline

### Step 22: Performance Optimization

**Enable Caching:**
- Already configured in `.htaccess` file

**Optimize Images:**
- Your admin portal already optimizes uploaded images
- Consider compressing assets before upload

**Monitor Performance:**
- Use Google PageSpeed Insights
- Test on GTmetrix.com
- Check loading times

---

## 📱 Quick Reference Card

### To Access:
- **Website:** `https://your-domain.com`
- **Admin Portal:** `https://your-domain.com/adminportal/admin.html`
- **Teacher Portal:** `https://your-domain.com/teacher-application/teacher.html`
- **Hostinger Panel:** `https://hpanel.hostinger.com`

### To Restart Application:
1. Hostinger Panel → Node.js
2. Click on your app
3. Click "Restart Application"

### To View Logs:
1. Hostinger Panel → Node.js
2. Click on your app
3. Click "View Logs"

### To Update Code:
1. Make changes locally
2. Upload changed files via File Manager
3. If package.json changed, run NPM Install
4. Restart application

---

## 🎉 Congratulations!

Your application is now live on Hostinger! 

**Next Steps:**
1. Share the URL with stakeholders
2. Monitor for any issues
3. Set up regular backups
4. Plan for ongoing maintenance

**Need Help?**
- Hostinger Support: https://www.hostinger.com/tutorials/
- Firebase Docs: https://firebase.google.com/docs

---

## Maintenance Schedule

**Daily (First Week):**
- Check application logs
- Test all features
- Monitor error rates

**Weekly:**
- Review Firebase quota usage
- Check backup status
- Update dependencies if needed

**Monthly:**
- Review security settings
- Check for Node.js updates
- Database cleanup (handled automatically by cron jobs)

---

**Deployed on:** _______________  
**Domain:** _______________  
**Hostinger Plan:** _______________

Good luck! 🚀
