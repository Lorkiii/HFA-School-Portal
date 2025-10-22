# Pre-Deployment Checklist ✅

Print this and check off each item before deploying!

## 📦 Files Ready

- [ ] All project files are in one folder
- [ ] `serviceAccountKey.json` is in `server/` folder
- [ ] `package.json` exists in root
- [ ] No `node_modules/` folder (delete if present)
- [ ] `.env` file created with your credentials
- [ ] `.htaccess` file exists in root

## 🔐 Credentials Ready

### Gmail App Password
- [ ] Gmail account email: _______________________
- [ ] App Password generated (16 characters)
- [ ] Tested sending email from this account

### Firebase
- [ ] `serviceAccountKey.json` downloaded
- [ ] Firebase project ID: _______________________
- [ ] Storage bucket name: _______________________
- [ ] Domain added to Authorized Domains

### JWT Secret
- [ ] Generated random 32+ character string
- [ ] Saved in `.env` file
- [ ] Copied for Hostinger environment variables

## 🌐 Hostinger Account

- [ ] Hostinger account created
- [ ] Business or Premium plan purchased (has Node.js support)
- [ ] Domain name chosen: _______________________
- [ ] Can log into hpanel.hostinger.com
- [ ] Know your hosting username: _______________________

## 🔧 Code Updates

- [ ] CORS origins updated in `server/server.mjs` (line 86)
- [ ] Tested locally that everything works
- [ ] All npm dependencies listed in package.json

## 📧 Email Testing

Before deploying, test email locally:

```bash
node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'YOUR_EMAIL@gmail.com',
    pass: 'YOUR_APP_PASSWORD'
  }
});

transporter.sendMail({
  from: 'YOUR_EMAIL@gmail.com',
  to: 'YOUR_EMAIL@gmail.com',
  subject: 'Test Email',
  text: 'If you receive this, your SMTP is working!'
}, (err, info) => {
  if (err) console.error('ERROR:', err);
  else console.log('SUCCESS! Email sent:', info.messageId);
});
"
```

## 📋 Deployment Day Checklist

### Part 1: Upload (30 minutes)
- [ ] Files uploaded via File Manager
- [ ] Folder structure matches guide
- [ ] serviceAccountKey.json uploaded to server/

### Part 2: Node.js Setup (15 minutes)
- [ ] Node.js application created
- [ ] Startup file set to: `server/server.mjs`
- [ ] Node.js version: 18.x or 20.x
- [ ] All environment variables added
- [ ] NPM Install completed successfully

### Part 3: Configuration (10 minutes)
- [ ] CORS updated with production domain
- [ ] SSL certificate installed
- [ ] HTTPS forced via .htaccess
- [ ] Firebase authorized domains updated

### Part 4: Testing (20 minutes)
- [ ] Landing page loads (https://your-domain.com)
- [ ] Admin login works
- [ ] OTP email received
- [ ] Dashboard loads
- [ ] File uploads work
- [ ] Teacher application works
- [ ] Student enrollment works
- [ ] Emails are being sent
- [ ] Tested on mobile device

## 🚨 Troubleshooting Ready

- [ ] Know how to access logs in Hostinger
- [ ] Know how to restart application
- [ ] Have Firebase Console bookmarked
- [ ] Have Hostinger support contact saved

## 📞 Support Contacts

**Hostinger Support:** 
- Chat: hpanel.hostinger.com (bottom right)
- Email: support@hostinger.com

**Firebase Support:**
- Docs: firebase.google.com/docs
- Community: stackoverflow.com/questions/tagged/firebase

**Node.js:**
- Docs: nodejs.org/docs

## ⏰ Estimated Time

- **Preparation:** 30 minutes
- **Upload & Setup:** 45 minutes
- **Testing:** 30 minutes
- **Total:** ~2 hours (first time)

## 💡 Pro Tips

1. **Do it when you have time** - Don't rush!
2. **Have backup of everything** - Keep local copy safe
3. **Test locally first** - Make sure it works on your computer
4. **Deploy during low traffic** - Weekday afternoon is good
5. **Have someone help** - Two pairs of eyes catch more errors

## ✅ Ready to Deploy?

If ALL boxes are checked, you're ready! 

Open `HOSTINGER_STEP_BY_STEP.md` and follow along!

---

**Date Started:** _______________  
**Time Started:** _______________  
**Deployed By:** _______________  
**Domain:** _______________  

**Deployment Status:**
- [ ] Started
- [ ] Files Uploaded  
- [ ] Node.js Configured
- [ ] Application Running
- [ ] SSL Installed
- [ ] Testing Complete
- [ ] ✅ LIVE!
