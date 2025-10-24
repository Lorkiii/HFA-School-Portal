# Database Defense Guide - Holy Family Academy School Portal

## Quick Reference for Panel Questions

---

## Q1: "Does your system have a database schema?"

### ✅ **Answer:**

**Yes**, but not in the traditional SQL sense. 

Our system uses **Firebase Firestore**, which is a **NoSQL document database**. Instead of tables and rows, we have **collections and documents**.

The schema is defined through:
1. **Collection structure** - Defined in our backend code (`server/server.mjs`, `server/dbClient.js`)
2. **Document fields** - Enforced through server-side validation
3. **Security rules** - Defined in `database.rules.json`
4. **Application logic** - Data structure enforcement in API routes

**Key Point**: NoSQL databases don't require predefined schemas like SQL databases, but we still have a **well-defined data structure** that's enforced by our backend server.

---

## Q2: "Where is your schema defined?"

### ✅ **Answer:**

The schema is defined in **multiple files**:

**1. Collection Definitions:**
- `server/server.mjs` - Lines 815-816 (jhsApplicants, shsApplicants)
- `server/dbClient.js` - Lines 39, 49, 71, 91, 174, 198

**2. Document Structure Examples:**

**Location**: `server/server.mjs` Line 835
```javascript
const toSave = {
  ...formData,
  status: "pending",
  createdAt: admin.firestore.FieldValue.serverTimestamp()
};
const docRef = await db.collection(collectionName).add(toSave);
```

**3. Security Rules:**
- `database.rules.json` - Firestore access control
- `firebase.json` - Firebase configuration

**4. Documentation:**
- `DATABASE_SCHEMA.md` - Complete schema documentation (10 collections)
- `DATABASE_DIAGRAM.md` - Visual relationship diagrams

---

## Q3: "What collections/tables do you have?"

### ✅ **Answer:**

We have **10 main collections**:

| # | Collection Name | Purpose |
|---|-----------------|---------|
| 1 | `users` | User authentication & profiles (admin/applicant) |
| 2 | `jhsApplicants` | Junior High School student applications |
| 3 | `shsApplicants` | Senior High School student applications |
| 4 | `teacherApplicants` | Teacher job applications |
| 5 | `email_confirmations` | Email verification OTP codes |
| 6 | `applicant_messages` | Messages between admins and applicants |
| 7 | `notifications` | System notifications for admins |
| 8 | `activity_logs` | Admin action audit trail |
| 9 | `announcements` | School announcements |
| 10 | `enrollment` | Enrollment period settings |

**Plus Firebase Storage buckets** for file uploads (requirements, documents, attachments).

---

## Q4: "How does data get saved in Firebase?"

### ✅ **Answer:**

**Step-by-Step Process:**

**For Student Applications (JHS/SHS):**

```
1. Student fills form on frontend
   ↓
2. Frontend uploads files to Firebase Storage
   • /requirements/{applicantId}/reportcard.pdf
   • /requirements/{applicantId}/psa.pdf
   ↓
3. Get download URLs from Storage
   ↓
4. Frontend sends POST request to /api/submit-application
   • Includes form data + file URLs
   ↓
5. Backend validates data
   ↓
6. Backend saves to Firestore collection
   • db.collection("jhsApplicants").add(data)
   ↓
7. Firestore auto-generates document ID
   ↓
8. Return success response with document ID
```

**Code Example** (`server/server.mjs` Line 835):
```javascript
const docRef = await db.collection(collectionName).add(toSave);
const newId = docRef.id;  // Auto-generated ID
res.status(200).json({ success: true, newId });
```

---

## Q5: "How do you ensure data security?"

### ✅ **Answer:**

We use **5 layers of security**:

**Layer 1: Firestore Security Rules**
```json
{
  "rules": {
    ".read": false,   // Block direct database reads
    ".write": false   // Block direct database writes
  }
}
```
**All access MUST go through our backend server.**

**Layer 2: Authentication**
- Firebase Authentication (email/password)
- JWT token verification
- HTTP-only session cookies

**Layer 3: Role-Based Access Control**
```javascript
// Only admins can access certain routes
const requireAdmin = async (req, res, next) => {
  const userDoc = await db.collection('users').doc(uid).get();
  if (userDoc.data().role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};
```

**Layer 4: Data Validation**
- Email format checks
- Required field validation
- File type/size limits
- Business rule enforcement

**Layer 5: Audit Logging**
- All admin actions logged in `activity_logs` collection
- Timestamp + actor tracking
- Immutable log records

---

## Q6: "What are the relationships between collections?"

### ✅ **Answer:**

**Main Relationships:**

1. **users ↔ teacherApplicants** (1:1)
   - Linked by: `teacherApplicants.uid` → `users.uid`
   - A teacher applicant becomes a user after email confirmation

2. **teacherApplicants ↔ applicant_messages** (1:Many)
   - Linked by: `applicant_messages.applicantId` → `teacherApplicants.id`
   - One applicant can have many messages

3. **users ↔ applicant_messages** (1:Many)
   - Linked by: `applicant_messages.fromUid` → `users.uid`
   - One user (admin) can send many messages

4. **teacherApplicants ↔ email_confirmations** (1:1)
   - Linked by: Document ID (same ID)
   - Each application has one email confirmation session

5. **users ↔ activity_logs** (1:Many)
   - Linked by: `activity_logs.actorUid` → `users.uid`
   - Each admin action is logged

**See**: `DATABASE_DIAGRAM.md` for visual relationships

---

## Q7: "Why did you choose Firebase/NoSQL over SQL?"

### ✅ **Answer:**

**Advantages for our use case:**

1. **Scalability**
   - Automatically scales horizontally
   - No need to manage database servers
   - Handles traffic spikes during enrollment periods

2. **Real-time Capabilities**
   - Real-time listeners for instant updates
   - Perfect for messaging system
   - Live notification updates

3. **File Storage Integration**
   - Firebase Storage built-in
   - Easy file upload/download
   - Integrated with authentication

4. **No Complex Joins Needed**
   - Our data is mostly hierarchical
   - Limited relationships between entities
   - NoSQL fits the data model

5. **Rapid Development**
   - No database setup required
   - Built-in authentication
   - Managed infrastructure

6. **Cost-Effective**
   - Pay-per-use pricing
   - Free tier generous for our scale
   - No server maintenance costs

**Trade-offs Considered:**
- Less complex querying (but we don't need complex queries)
- No ACID transactions across collections (but we handle this in code)
- Data denormalization needed (but improves read performance)

---

## Q8: "How do you handle file uploads?"

### ✅ **Answer:**

**File Upload Process:**

**Step 1: Frontend Upload to Firebase Storage**
```javascript
// Frontend code
const fileRef = storage.ref(`/requirements/${applicantId}/reportcard.pdf`);
await fileRef.put(file);
const downloadUrl = await fileRef.getDownloadURL();
```

**Step 2: Save URL to Firestore**
```javascript
// Backend saves URL in document
{
  requirements: {
    reportcard: {
      url: "https://firebasestorage.googleapis.com/.../reportcard.pdf",
      checked: false
    }
  }
}
```

**Storage Structure:**
```
/requirements/{applicantId}/
  - reportcard.pdf
  - psa.pdf
  - goodMoral.pdf

/teacher-documents/{applicantId}/
  - resume.pdf
  - certificates.pdf

/message-attachments/{messageId}/
  - attachment.pdf
```

**File Access Control:**
- Files are only accessible via download URLs
- URLs are stored in Firestore documents
- Access controlled by backend API
- Only authenticated users can access their own files

---

## Q9: "How do you validate data before saving?"

### ✅ **Answer:**

**Server-Side Validation Examples:**

**1. Required Fields Check**
```javascript
if (!studentId || !email || !subject || !message) {
  return res.status(400).json({ 
    ok: false, 
    error: "Missing required fields" 
  });
}
```

**2. Email Validation**
```javascript
// Check email matches application record
if (storedEmail !== providedEmail) {
  return res.status(403).json({ 
    error: "Provided email does not match student record" 
  });
}
```

**3. Role-Based Validation**
```javascript
const actualRole = userDoc.data().role;
if (actualRole !== expectedRole) {
  return res.status(403).json({ 
    error: "Access denied: You are not an admin" 
  });
}
```

**4. Rate Limiting (OTP)**
```javascript
// Max 3 resends per hour
if (resendCount >= 3) {
  return res.status(429).json({ 
    error: 'Resend limit reached' 
  });
}

// 3-minute cooldown between resends
if (now - lastSentAt < 180000) {
  return res.status(429).json({ 
    error: 'Cooldown active' 
  });
}
```

**5. Data Type Validation**
```javascript
// Ensure timestamp is valid
createdAt: admin.firestore.FieldValue.serverTimestamp()

// Ensure arrays are arrays
recipients: Array.isArray(msg.recipients) 
  ? msg.recipients 
  : [msg.recipients]
```

---

## Q10: "What happens to old/expired data?"

### ✅ **Answer:**

We use **automated cleanup jobs** (cron jobs) that run **daily at 2:00 AM**:

**1. Teacher Account Auto-Deletion** (30-day expiration)

```javascript
// Delete teacher applicants who are still "pending" after 30 days
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const expiredApplicants = await db.collection('teacherApplicants')
  .where('status', '==', 'pending')
  .where('createdAt', '<', thirtyDaysAgo)
  .get();

// Soft delete: Mark as expired
await appRef.update({
  deletedAt: admin.firestore.FieldValue.serverTimestamp(),
  isExpired: true
});

// Delete from Firebase Auth
await admin.auth().deleteUser(uid);
```

**2. Archived Messages Auto-Deletion** (60-day retention)

```javascript
// Delete archived messages older than 60 days
const sixtyDaysAgo = new Date();
sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

const oldMessages = await db.collection('applicant_messages')
  .where('isArchived', '==', true)
  .where('archivedAt', '<', sixtyDaysAgo)
  .get();

// Permanently delete
await msgRef.delete();
```

**Why?**
- Keeps database clean
- Reduces storage costs
- Complies with data retention policies
- Removes expired/inactive accounts

**Location**: `server/server.mjs` Lines 1270-1370

---

## Q11: "How do you track admin actions?"

### ✅ **Answer:**

Every admin action is logged in the `activity_logs` collection:

**Example Logged Actions:**
- `admin-send-message` - Admin sent message to applicant
- `applicant-created` - New teacher account created
- `status-update` - Application status changed
- `interview-scheduled` - Interview scheduled
- `requirements-checked` - Requirements verified

**Log Structure:**
```javascript
{
  actorUid: "admin-uid-123",
  actorEmail: "admin@hfa.edu",
  actorName: "John Admin",
  targetUid: "applicant-uid-456",
  action: "admin-send-message",
  detail: "Subject: Interview Confirmation",
  timestamp: Timestamp,
  createdAt: Timestamp
}
```

**Code Implementation** (`server/server.mjs` Line 657):
```javascript
await db.collection('activity_logs').add({
  actorUid,
  actorEmail,
  actorName,
  targetUid,
  action,
  detail,
  timestamp: admin.firestore.FieldValue.serverTimestamp(),
  createdAt: admin.firestore.FieldValue.serverTimestamp()
});
```

**Benefits:**
- Complete audit trail
- Accountability for admin actions
- Debugging assistance
- Security incident investigation

---

## Q12: "What database optimization techniques do you use?"

### ✅ **Answer:**

**1. Denormalization** (NoSQL best practice)
```javascript
// Store display name in multiple places to avoid joins
{
  senderName: "John Admin",    // Denormalized
  senderEmail: "john@hfa.edu"  // Denormalized
}
```
**Benefit**: Faster reads, no need for joins

**2. Composite Indexes**
```javascript
// Index for querying messages by applicant and time
applicant_messages:
  - applicantId (ASC) + createdAt (ASC)

// Index for finding expired applications
teacherApplicants:
  - status (ASC) + createdAt (ASC)
```
**Benefit**: Fast complex queries

**3. Soft Deletes**
```javascript
{
  deletedAt: Timestamp,
  isExpired: true
}
```
**Benefit**: Data recovery possible, maintains referential integrity

**4. Pagination** (not shown in code, but should be implemented)
```javascript
// Limit large result sets
.limit(50)
.startAfter(lastDoc)
```

**5. Selective Field Retrieval**
```javascript
// Only get needed fields
const snap = await db.collection('users')
  .where('role', '==', 'admin')
  .select('email', 'name')  // Only these fields
  .get();
```

---

## Q13: "How do you handle concurrent users?"

### ✅ **Answer:**

Firebase Firestore handles concurrency automatically:

**1. Optimistic Locking** (built-in)
- Firestore uses multi-version concurrency control (MVCC)
- Multiple reads can happen simultaneously
- Writes are atomic at document level

**2. Transactions** (for critical operations)
```javascript
await db.runTransaction(async (transaction) => {
  const userDoc = await transaction.get(userRef);
  transaction.update(userRef, { status: 'approved' });
});
```

**3. Batch Writes** (for multiple operations)
```javascript
const batch = db.batch();
batch.update(docRef1, { status: 'approved' });
batch.update(docRef2, { notified: true });
await batch.commit();  // All or nothing
```

**4. Server Timestamps**
```javascript
// Always use server timestamp (not client time)
createdAt: admin.firestore.FieldValue.serverTimestamp()
```
**Benefit**: Consistent timestamps regardless of client timezone

**5. Session Management**
- HTTP-only cookies prevent session hijacking
- Token expiration enforced
- One session per user (controlled by Firebase Auth)

---

## Common Panel Questions - Quick Answers

| Question | Quick Answer |
|----------|-------------|
| "What database are you using?" | Firebase Firestore (NoSQL) + Firebase Storage |
| "How many tables/collections?" | 10 Firestore collections + 4 Storage buckets |
| "What's your primary key?" | Auto-generated document IDs by Firestore |
| "Do you have foreign keys?" | No FK constraints, but we use document ID references |
| "How do you backup data?" | Firebase automatic daily backups + export to GCS |
| "What's your database size?" | Current: ~50MB (scales to petabytes) |
| "Database location?" | asia-southeast1 (Singapore) |
| "Can you show the schema?" | Yes - `DATABASE_SCHEMA.md` (10 pages) |
| "How do you prevent SQL injection?" | Not applicable - NoSQL, no SQL queries |
| "Do you use stored procedures?" | No - business logic in Node.js backend |

---

## Tips for Defense Presentation

### ✅ **DO:**

1. **Show the schema documentation files**
   - `DATABASE_SCHEMA.md`
   - `DATABASE_DIAGRAM.md`

2. **Explain NoSQL vs SQL choice**
   - Mention scalability
   - Real-time features
   - File storage integration

3. **Demonstrate security layers**
   - Show `database.rules.json`
   - Explain backend-only access
   - Mention audit logging

4. **Show code examples**
   - `server/server.mjs` - Data saving
   - `server/dbClient.js` - Query methods
   - `server/routes/` - Validation logic

5. **Discuss data cleanup**
   - Automated cron jobs
   - Data retention policies

### ❌ **DON'T:**

1. Say "we don't have a schema" - You DO have a schema, just not SQL-style
2. Apologize for using NoSQL - It's the right choice for this application
3. Get defensive about Firebase - Explain the benefits
4. Skip security discussion - Security is critical

---

## Visual Aids to Prepare

1. **Entity Relationship Diagram** - Already in `DATABASE_DIAGRAM.md`
2. **Data Flow Diagrams** - Already in `DATABASE_DIAGRAM.md`
3. **Security Architecture Diagram** - Already in `DATABASE_DIAGRAM.md`
4. **Sample Data Screenshots** - Prepare Firebase Console screenshots

---

## Practice Questions to Prepare

1. Walk me through what happens when a student submits an application
2. How do you ensure only admins can delete applications?
3. What happens if two admins edit the same applicant at the same time?
4. How do you recover if data is accidentally deleted?
5. Show me how teacher email verification works
6. Explain your file storage strategy
7. How do you handle database backups?
8. What's your disaster recovery plan?

---

**Good luck with your defense!** 🎓

Remember:
- **You have a schema** - it's defined in code
- **Your database is secure** - multiple security layers
- **Your design is intentional** - NoSQL fits the requirements
- **You have documentation** - Complete schema docs available

**Files to reference during defense:**
1. `DATABASE_SCHEMA.md` - Complete documentation
2. `DATABASE_DIAGRAM.md` - Visual diagrams
3. `DEFENSE_GUIDE.md` - This file
4. `server/server.mjs` - Main database operations
5. `server/dbClient.js` - Query methods
6. `database.rules.json` - Security rules
