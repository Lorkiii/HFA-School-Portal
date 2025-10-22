---
description: defense
auto_execution_mode: 1
---



## **Security Measures Already in Place**

### **1. Authentication & Authorization** 🔐

**What You Have:**
- **Firebase Authentication** - Industry-standard authentication service used by millions of apps
- **JWT (JSON Web Tokens)** - Secure session management with server-side verification
- **Role-Based Access Control (RBAC)** - [requireAdmin](cci:1://file:///c:/Users/Niets/OneDrive/Desktop/capstone/server/server.mjs:454:0-503:1) middleware checks user roles before granting access
- **Token Revocation System** - Logout invalidates tokens server-side (in-memory revoked tokens store)
- **Multi-layer Auth** - Supports both Firebase ID tokens AND server JWTs

**Defense Talking Points:**
> *"We implemented a multi-layered authentication system using Firebase Authentication, which is an industry-standard solution trusted by major companies. Every admin API endpoint is protected by our [requireAdmin](cci:1://file:///c:/Users/Niets/OneDrive/Desktop/capstone/server/server.mjs:454:0-503:1) middleware that verifies both the authentication token AND the user's role from our Firestore database. If a user is not an admin, they receive a 403 Forbidden error. We also implemented token revocation for logout, ensuring that once a user logs out, their session token cannot be reused."*

**Code Evidence:** [server.mjs](cci:7://file:///c:/Users/Niets/OneDrive/Desktop/capstone/server/server.mjs:0:0-0:0) lines 458-504

---

### **2. OTP Email Verification** 📧

**What You Have:**
- **6-digit OTP** generation for admin login
- **5-minute expiration** on OTP codes
- **Rate limiting** on OTP requests:
  - 3-minute cooldown between resend attempts
  - Maximum 5 resends per hour
  - 429 (Too Many Requests) response when limits exceeded
- **Email-based delivery** through secure SMTP (Gmail)

**Defense Talking Points:**
> *"Admin access requires two-factor authentication via OTP sent to registered email addresses. The OTP expires in 5 minutes and cannot be reused. We implemented rate limiting to prevent brute force attacks - users can only request OTP resends 5 times per hour with a 3-minute cooldown between attempts. This protects against automated attacks while maintaining usability."*

**Code Evidence:** [server.mjs](cci:7://file:///c:/Users/Niets/OneDrive/Desktop/capstone/server/server.mjs:0:0-0:0) lines 148-453

---

### **3. File Upload Security** 📁

**What You Have:**
- **File size limits:**
  - Teacher attachments: 10MB max
  - Enrollment documents: 150MB max (for multiple documents)
  - Announcement images: 30MB max
- **File type validation** (whitelist approach):
  - Images: JPEG, PNG, WebP, GIF only
  - Documents: PDF, DOC, DOCX, XLS, XLSX only
- **Multer middleware** with in-memory storage (files don't touch disk)
- **Sharp image optimization** - Resizes images to max 1920px, compresses to 80% quality
- **Unique filenames** with timestamps and random IDs (prevents collisions and predictable paths)
- **Firebase Storage** with controlled public access

**Defense Talking Points:**
> *"All file uploads are validated on the server side. We use a whitelist approach - only specific file types are accepted (images for announcements, documents for applications). File sizes are strictly limited to prevent abuse. Images are automatically optimized using the Sharp library to reduce storage costs and improve page load times. Files are stored in Firebase Storage with unique, unpredictable filenames, and only made publicly accessible when necessary."*

**Code Evidence:** 
- [routes/announcements.js](cci:7://file:///c:/Users/Niets/OneDrive/Desktop/capstone/server/routes/announcements.js:0:0-0:0) lines 10-22
- `routes/teacher-messages.js` lines 7-35
- `routes/applicants.js` lines 17-20

---

### **4. Input Validation** ✅

**What You Have:**
- **Phone number validation** - Custom validator ensures proper Philippine mobile format
- **Required field validation** on frontend AND backend
- **Email format validation** through Firebase Auth
- **Character limits** enforced (e.g., 500 chars for notes)

**Defense Talking Points:**
> *"We implement validation on both frontend and backend. For example, phone numbers are validated using a custom function that ensures they follow Philippine mobile number format (+639XXXXXXXXX). This prevents incorrect data entry and potential injection attacks. All user inputs are validated before being stored in the database."*

**Code Evidence:** [server/utils/phoneValidator.js](cci:7://file:///c:/Users/Niets/OneDrive/Desktop/capstone/server/utils/phoneValidator.js:0:0-0:0)

---

### **5. Database Security** 🗄️

**What You Have:**
- **Firestore** - Google Cloud's NoSQL database with built-in security
- **Server-side data access only** - Frontend never directly writes to sensitive collections
- **User-specific data isolation** - Users can only access their own records
  - Teachers see only their application
  - Admins access data through authenticated API routes
- **Activity logging** - All admin actions logged with timestamps and user IDs

**Defense Talking Points:**
> *"We use Google Cloud Firestore, which provides encryption at rest and in transit by default. The frontend never directly accesses sensitive database collections. All data operations go through our backend API, where we enforce authentication and authorization. Each API endpoint validates the user's identity and role before allowing any database operation. We also maintain an activity log that records all admin actions for audit purposes."*

**Code Evidence:** Check any route file that uses [requireAdmin](cci:1://file:///c:/Users/Niets/OneDrive/Desktop/capstone/server/server.mjs:454:0-503:1)

---

### **6. Secure Communication** 🔒

**What You Have:**
- **HTTPS-ready** (secure in production with proper hosting)
- **CORS configuration** - Only allows requests from specified origins
- **httpOnly cookies** - Session tokens stored in httpOnly cookies (cannot be accessed by JavaScript, preventing XSS theft)
- **SameSite cookie policy** - Prevents CSRF attacks
- **Environment variables** - Sensitive credentials (JWT secret, SMTP passwords, Firebase keys) stored in `.env` file

**Defense Talking Points:**
> *"Our application uses httpOnly cookies with SameSite policy to prevent both XSS and CSRF attacks. Session tokens are never exposed to client-side JavaScript. We configured CORS to only accept requests from authorized origins. All sensitive credentials like database keys, email passwords, and JWT secrets are stored in environment variables, never committed to version control. In production, the site would be served over HTTPS, encrypting all data in transit."*

**Code Evidence:** 
- [server.mjs](cci:7://file:///c:/Users/Niets/OneDrive/Desktop/capstone/server/server.mjs:0:0-0:0) lines 84-89 (CORS)
- [server.mjs](cci:7://file:///c:/Users/Niets/OneDrive/Desktop/capstone/server/server.mjs:0:0-0:0) lines 134-143 (httpOnly cookies)
- [server.mjs](cci:7://file:///c:/Users/Niets/OneDrive/Desktop/capstone/server/server.mjs:0:0-0:0) lines 104-109 (environment variables)

---

### **7. Password Security** 🔑

**What You Have:**
- **Firebase Authentication** handles password hashing using industry-standard bcrypt
- **No plain-text passwords** stored anywhere
- **Password reset** through Firebase's secure email flow

**Defense Talking Points:**
> *"Password security is handled by Firebase Authentication, which uses bcrypt hashing with automatic salting. We never see or store plain-text passwords. Password resets are handled through Firebase's secure email verification flow, ensuring that only the account owner can reset their password."*

---

### **8. Business Logic Security** 💼

**What You Have:**
- **Interview scheduling restrictions** - Max 3 interviews per day, 1-hour buffer between slots
- **Enrollment period controls** - Prevents submissions outside enrollment dates
- **Status-based access control** - Teacher applicants see different features based on their application status
- **Server-side date validation** - All date comparisons happen on backend to prevent manipulation

**Defense Talking Points:**
> *"We implemented business logic security to prevent abuse. For example, the system prevents scheduling more than 3 interviews per day and enforces a 1-hour buffer between interview slots. Enrollment forms are only accessible during configured enrollment periods. These validations happen on the server side, so they cannot be bypassed by manipulating the frontend code."*

**Code Evidence:** Check the interview scheduling memories

---

## **What to Say When Asked About Security**

### **Common Panelist Questions:**

**Q: "How do you prevent unauthorized access?"**
> "We use three layers: (1) Firebase Authentication verifies user identity, (2) JWT tokens manage sessions with expiration, and (3) Role-Based Access Control checks if the user has admin privileges before allowing any sensitive operation. Every protected API endpoint uses our [requireAdmin](cci:1://file:///c:/Users/Niets/OneDrive/Desktop/capstone/server/server.mjs:454:0-503:1) middleware."

**Q: "What about SQL injection or NoSQL injection?"**
> "We use Firestore, which is a NoSQL database from Google. All queries use the official Firestore SDK, which automatically escapes and sanitizes inputs. We don't construct raw queries with string concatenation, so injection attacks are not possible."

**Q: "How do you protect file uploads?"**
> "We validate file types using a whitelist (only specific extensions allowed), limit file sizes (10-150MB depending on purpose), scan files using Multer middleware, and optimize images before storage. Files are stored in Firebase Storage with unique, unpredictable filenames."

**Q: "What about cross-site scripting (XSS)?"**
> "We use httpOnly cookies for session tokens, so they can't be stolen via JavaScript. User-generated content is rendered using safe methods that escape HTML. Our frontend frameworks automatically sanitize outputs to prevent script injection."

**Q: "Is user data encrypted?"**
> "Yes, in two ways: (1) Data at rest - Firestore automatically encrypts all data stored in the database, and (2) Data in transit - All communication between client and server uses HTTPS in production, encrypting data during transmission."

---

## **Possible Improvements You Can Mention**

*(If panelists ask "What would you improve?")*

1. **Firebase Security Rules** - "We could add Firestore security rules as an additional layer, though we currently handle all data access through authenticated backend endpoints."

2. **Rate Limiting on APIs** - "We could implement global rate limiting using libraries like express-rate-limit to prevent API abuse."

3. **Content Security Policy (CSP)** - "We could add CSP headers to prevent unauthorized script execution."

4. **Audit Logging** - "We already log admin actions, but we could expand this to log all API requests for better security monitoring."

5. **Two-Factor Authentication** - "We currently use OTP for admin login, which is a form of 2FA. We could expand this to all user types."

---

## **Key Confidence Boosters**

✅ **Firebase is enterprise-grade** - Used by companies like Spotify, The New York Times, and Venmo

✅ **JWT is industry standard** - Used by most modern web applications

✅ **Your authentication is robust** - Multi-layer verification (Firebase + JWT + Role checking)

✅ **File handling is secure** - Type validation, size limits, optimization, and isolated storage

✅ **You follow best practices** - httpOnly cookies, CORS, environment varia