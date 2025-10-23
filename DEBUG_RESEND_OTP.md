# Debugging Resend OTP Issue - Instructions

## Changes Made
1. **Added API_BASE_URL configuration** to automatically detect development environment
2. **Added comprehensive debug logging** to track requests and responses
3. **Fixed cross-origin API calls** by using full URL in development

## How to Test

### 1. Clear Browser Cache First
```javascript
// Run in browser console (F12 -> Console tab)
localStorage.clear();
sessionStorage.clear();
```
Then do a hard refresh: **Ctrl+Shift+R**

### 2. Check for Service Workers
1. Open DevTools (F12)
2. Go to **Application** tab
3. Click **Service Workers** on left sidebar
4. If any workers are listed for your domain, click **Unregister**

### 3. Start Fresh Test
1. Make sure your backend server is running on **port 3000**
2. Make sure your frontend is on **port 5500** (Live Server)
3. Go to login page and login with admin credentials
4. When you reach the OTP verification page, open the **Console** (F12)

### 4. What to Look For in Console

You should see these debug messages:

```
Verify OTP Page Loaded {hostname: "localhost", API_BASE_URL: "http://localhost:3000", fullURL: "..."}
```

When you click "Resend OTP":
```
Resend OTP Request: {url: "http://localhost:3000/auth/resend-otp", body: {...}, hasIdToken: true, email: "..."}
Resend OTP Response: {status: 200, ok: true, statusText: "OK"}
```

### 5. Check Network Tab
1. Open DevTools Network tab
2. Click "Resend OTP"
3. Look for the request to `/auth/resend-otp`
4. It should show:
   - URL: `http://localhost:3000/auth/resend-otp`
   - Method: POST
   - Status: 200 (or 429 if rate limited)

### 6. If You Still See Wrong URL
If you still see `/api//sendmail/resend-otp`, then:

1. **Check for browser extensions:**
   - Disable ALL extensions temporarily
   - Try in Incognito mode (make sure extensions are disabled there)

2. **Check for proxy/VPN:**
   - Disable any proxy or VPN software

3. **Try different browser:**
   - Test in Chrome, Firefox, or Edge

4. **Check for modified hosts file:**
   - Check `C:\Windows\System32\drivers\etc\hosts`
   - Make sure localhost points to 127.0.0.1

### 7. Expected Behavior

**First click on Resend OTP:**
- Should send new OTP to email
- Show countdown timer (3 minutes)
- Console shows successful request

**If clicked too soon:**
- Status 429 (rate limited)
- Shows "Please wait X seconds before resending"

**After 5 resends in 1 hour:**
- Maximum limit reached
- Must wait for rolling window to reset

## Troubleshooting

### Issue: "No pending OTP session found"
- This means the server doesn't have an OTP session for this email
- Solution: Go back to login page and login again

### Issue: Network Error
- Check if backend server is running: `node server.mjs`
- Check console for any server errors
- Verify ports: Frontend on 5500, Backend on 3000

### Issue: CORS Error
- The fix should handle this with `credentials: 'include'`
- If still occurs, check server CORS configuration

## Debug Mode
Debug mode is currently **ON** (line 11 in verify-otp.js).
To disable debug logs, change:
```javascript
const DEBUG = true;  // Change to false to disable logs
```

## Report Back
After testing, please share:
1. Console log output
2. Network tab screenshot showing the actual request
3. Any error messages

This will help identify if the issue is:
- Browser extension interference
- Caching issue
- Network configuration
- Or something else entirely
