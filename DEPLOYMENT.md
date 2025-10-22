# Deployment Guide for Hostinger

This guide will walk you through deploying the Holy Family Academy School Portal to Hostinger's Node.js hosting.

## Prerequisites

Before deploying, ensure you have:
- A Hostinger account with Node.js hosting plan
- Firebase project credentials (`serviceAccountKey.json`)
- Gmail account with App Password for SMTP
- All project files ready

## Step 1: Prepare Your Application

### 1.1 Create Environment Variables File

Create a `.env` file in your project root with the following variables:

```env
JWT_SECRET=your_super_secret_jwt_key_minimum_32_characters_long
SMTP_USER=your_school_email@gmail.com
SMTP_PASS=your_gmail_app_password
NODE_ENV=production
PORT=3000
```

**Important Notes:**
- **JWT_SECRET**: Generate a strong random string (at least 32 characters). You can use: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **SMTP_PASS**: Use Gmail App Password, not your regular password. [Get App Password here](https://myaccount.google.com/apppasswords)
- Don't commit `.env` to Git (it's already in `.gitignore`)

### 1.2 Verify Firebase Credentials

Ensure `serviceAccountKey.json` exists in the `server/` directory. This file contains your Firebase Admin SDK credentials.

**DO NOT commit this file to Git!** (It's already in `.gitignore`)

### 1.3 Update CORS Origins

Before deploying, update the CORS configuration in `server/server.mjs` (line 84-89) to include your Hostinger domain:

```javascript
app.use(
  cors({
    origin: [
      "https://your-domain.com",
      "https://www.your-domain.com"
    ],
    credentials: true,
  })
);
```

## Step 2: Deploy to Hostinger

### 2.1 Access Hostinger Control Panel

1. Log in to your Hostinger account at [https://www.hostinger.com/](https://www.hostinger.com/)
2. Navigate to **Hosting** → **Manage**
3. Go to **Advanced** → **Node.js**

### 2.2 Create Node.js Application

1. Click **"Create Application"**
2. Configure the application:
   - **Application Mode**: Production
   - **Application Root**: `/` (or your preferred directory)
   - **Application URL**: Your domain or subdomain
   - **Application Startup File**: `server/server.mjs`
   - **Node.js Version**: Select 18.x or higher

### 2.3 Upload Files via File Manager or FTP

**Option A: File Manager (Recommended for first-time)**

1. In Hostinger control panel, go to **Files** → **File Manager**
2. Navigate to your application root directory
3. Upload all files EXCEPT:
   - `node_modules/` (will install on server)
   - `.git/` (not needed)
   - `.env` (set separately)
   - `serviceAccountKey.json` (upload separately)

**Option B: FTP/SFTP**

1. Get FTP credentials from Hostinger control panel
2. Use FileZilla or similar FTP client
3. Upload all project files to the application root
4. Exclude `node_modules/`, `.git/`, `.env`

### 2.4 Set Environment Variables

1. In Node.js application settings, find **"Environment Variables"**
2. Add each variable from your `.env` file:

```
JWT_SECRET=your_actual_secret_here
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
NODE_ENV=production
```

### 2.5 Upload Firebase Credentials

**IMPORTANT**: Upload `serviceAccountKey.json` securely:

1. Use File Manager to upload to `server/serviceAccountKey.json`
2. Set file permissions to **600** (owner read/write only)
3. Verify the path matches the code in `server/server.mjs` (line 76-78)

### 2.6 Install Dependencies

1. In Hostinger Node.js application panel, click **"NPM Install"**
2. Or use Terminal (if available): 
   ```bash
   cd /path/to/your/app
   npm install --production
   ```

### 2.7 Start the Application

1. In Node.js application settings, click **"Start Application"**
2. Monitor the logs for any errors
3. Application should start on the configured port

## Step 3: Configure Domain and SSL

### 3.1 Domain Setup

1. Go to **Domains** section in Hostinger
2. Point your domain to the Node.js application
3. Update DNS records if using external domain

### 3.2 SSL Certificate

1. Hostinger provides free SSL certificates
2. Go to **SSL** section → **Install SSL**
3. Select your domain → **Install**
4. Wait for SSL activation (5-10 minutes)

### 3.3 Force HTTPS (Recommended)

Add this to your `.htaccess` or configure in Hostinger panel:

```apache
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

## Step 4: Firebase Configuration

### 4.1 Update Firebase Security Rules

Ensure your Firebase Storage rules allow public read for announcement images:

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

### 4.2 Update Firestore Rules

Ensure proper security rules are in place (check `database.rules.json`).

### 4.3 Add Authorized Domain

1. Go to Firebase Console → Authentication → Settings
2. Add your Hostinger domain to **Authorized Domains**:
   - `your-domain.com`
   - `www.your-domain.com`

## Step 5: Update Frontend Configuration

### 5.1 Update API URLs

If your frontend makes API calls, update the base URL in your JavaScript files:

- Check `api-fetch.js`, `firebase-config.js`, etc.
- Replace `http://localhost:3000` with your production domain

### 5.2 Update Firebase Client Config

Ensure `firebase-config.js` uses your Firebase project credentials:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

## Step 6: Testing

### 6.1 Test Core Functionality

1. ✅ Landing page loads
2. ✅ Admin login works
3. ✅ Teacher applicant login works
4. ✅ Forms submission works
5. ✅ File uploads work
6. ✅ Email sending works (check spam folder)
7. ✅ All static assets load (CSS, JS, images)

### 6.2 Check Logs

Monitor application logs in Hostinger panel:
- Node.js Application → **"View Logs"**
- Look for errors or warnings

### 6.3 Test on Multiple Devices

- Desktop browsers (Chrome, Firefox, Edge)
- Mobile devices (iOS Safari, Android Chrome)
- Tablet devices

## Troubleshooting

### Application Won't Start

**Check:**
- All environment variables are set correctly
- `serviceAccountKey.json` exists in correct location
- Node.js version is 18.x or higher
- No syntax errors in code

**View logs:**
```bash
# In Hostinger terminal
pm2 logs your-app-name
```

### CORS Errors

**Fix:** Update CORS origin in `server/server.mjs` to include your domain

### File Upload Fails

**Check:**
- Firebase Storage bucket name is correct (line 100 in server.mjs)
- Firebase Storage rules allow writes
- Multer configuration is correct

### Email Not Sending

**Check:**
- SMTP credentials are correct
- Gmail App Password is used (not regular password)
- Gmail account has "Less secure app access" enabled (if needed)
- Check email provider limits

### 500 Internal Server Error

**Check logs for:**
- Missing environment variables
- Firebase authentication errors
- Database connection issues

## Performance Optimization

### 6.1 Enable Compression

Already implemented in your code. Verify it's working:

```javascript
// Add to server.mjs if not present
import compression from 'compression';
app.use(compression());
```

### 6.2 Static File Caching

Set cache headers for static assets (already configured in your code).

### 6.3 Database Indexing

Ensure Firestore has proper indexes for queries:
- Go to Firebase Console → Firestore → Indexes
- Add composite indexes as needed

## Security Checklist

- ✅ `.env` and `serviceAccountKey.json` not in Git
- ✅ JWT_SECRET is strong and random
- ✅ CORS is configured for your domain only
- ✅ Firebase rules are properly restrictive
- ✅ HTTPS is enforced
- ✅ File upload limits are set (10MB)
- ✅ Input validation on all forms
- ✅ SQL injection protection (using Firestore)
- ✅ XSS protection (sanitize inputs)

## Maintenance

### Regular Tasks

1. **Monitor logs weekly** for errors
2. **Update dependencies monthly**: `npm update`
3. **Check Firebase quotas** to avoid overage
4. **Backup database regularly** (Firebase Console → Firestore → Export)
5. **Review security rules quarterly**

### Updating the Application

1. Make changes locally
2. Test thoroughly
3. Upload changed files via FTP/File Manager
4. If `package.json` changed, run `npm install` on server
5. Restart application in Hostinger panel

## Support Resources

- **Hostinger Support**: [https://www.hostinger.com/tutorials/](https://www.hostinger.com/tutorials/)
- **Firebase Documentation**: [https://firebase.google.com/docs](https://firebase.google.com/docs)
- **Node.js Documentation**: [https://nodejs.org/docs](https://nodejs.org/docs)

## Backup Strategy

### Automated Backups

1. **Firebase Firestore**: 
   - Enable automated backups in Firebase Console
   - Schedule: Daily at 2:00 AM

2. **Application Files**:
   - Use Hostinger's built-in backup feature
   - Or set up automated FTP backups

3. **Environment Variables**:
   - Keep a secure copy of `.env` file
   - Store in password manager or encrypted storage

---

## Quick Command Reference

```bash
# Install dependencies
npm install --production

# Start application (if using PM2)
pm2 start server/server.mjs --name school-portal

# View logs
pm2 logs school-portal

# Restart application
pm2 restart school-portal

# Check application status
pm2 status

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

**Deployment Date**: _____________  
**Deployed By**: _____________  
**Production URL**: _____________  

Good luck with your deployment! 🚀
