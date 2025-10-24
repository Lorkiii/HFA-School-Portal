# Holy Family Academy - Database Relationship Diagram

## Entity Relationship Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FIREBASE FIRESTORE DATABASE                       │
│                         (NoSQL - Document-Based)                         │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│   Firebase Auth      │ ◄─────── Authentication Layer
│   (External System)  │          (Email/Password)
└──────────┬───────────┘
           │ uid (Primary Key)
           │
           ├─────────────────────────────────────────────────┐
           │                                                 │
           ▼                                                 ▼
┌──────────────────────────────────┐          ┌─────────────────────────────┐
│         users                    │          │    teacherApplicants        │
├──────────────────────────────────┤          ├─────────────────────────────┤
│ [uid] (Document ID)              │          │ [auto-generated ID]         │
│ • email                          │          │ • firstName                 │
│ • displayName                    │◄─────────┤ • uid (→ users.uid)         │
│ • role (admin/applicant)         │          │ • email                     │
│ • forcePasswordChange            │          │ • status                    │
│ • createdAt                      │          │ • interviewSchedule         │
│ • updatedAt                      │          │ • createdAt                 │
└──────────┬───────────────────────┘          │ • deletedAt                 │
           │                                  │ • isExpired                 │
           │                                  └─────────┬───────────────────┘
           │                                            │
           │                                            │ applicantId
           │                                            │
           │                                            ▼
           │                          ┌─────────────────────────────────────┐
           │                          │    email_confirmations              │
           │                          ├─────────────────────────────────────┤
           │                          │ [applicationId] (→ teacherApplicants)│
           │                          │ • email                              │
           │                          │ • otp (6-digit code)                │
           │                          │ • expiresAt                         │
           │                          │ • lastSentAt                        │
           │                          │ • resendCount                       │
           │                          └─────────────────────────────────────┘
           │
           │
           ├──────────────────────────────────────────┐
           │                                          │
           ▼                                          ▼
┌─────────────────────────┐          ┌────────────────────────────────────┐
│    activity_logs        │          │    applicant_messages              │
├─────────────────────────┤          ├────────────────────────────────────┤
│ [auto-generated ID]     │          │ [auto-generated ID]                │
│ • actorUid (→ users)    │          │ • applicantId (→ teacherApplicants)│
│ • actorEmail            │          │ • fromUid (→ users)                │
│ • actorName             │          │ • senderName                       │
│ • targetUid             │          │ • senderEmail                      │
│ • action                │          │ • subject                          │
│ • detail                │          │ • body                             │
│ • timestamp             │          │ • recipients []                    │
│ • createdAt             │          │ • attachment {}                    │
└─────────────────────────┘          │ • isArchived                       │
                                     │ • archivedAt                       │
                                     │ • createdAt                        │
                                     └────────┬───────────────────────────┘
                                              │
                                              │ messageId
                                              │
                                              ▼
                                     ┌────────────────────────────────────┐
                                     │    notifications                   │
                                     ├────────────────────────────────────┤
                                     │ [auto-generated ID]                │
                                     │ • type                             │
                                     │ • applicantId (→ teacherApplicants)│
                                     │ • messageId (→ applicant_messages) │
                                     │ • seenBy [] (→ users.uid)          │
                                     │ • createdAt                        │
                                     └────────────────────────────────────┘


┌─────────────────────────────────┐          ┌─────────────────────────────┐
│      jhsApplicants              │          │      shsApplicants          │
├─────────────────────────────────┤          ├─────────────────────────────┤
│ [auto-generated ID]             │          │ [auto-generated ID]         │
│ • studentFirstName              │          │ • studentFirstName          │
│ • studentLastName               │          │ • studentLastName           │
│ • email                         │          │ • email                     │
│ • contactNumber                 │          │ • contactNumber             │
│ • gradeLevel                    │          │ • gradeLevel                │
│ • requirements {}               │          │ • strand                    │
│   - reportcard                  │          │ • requirements {}           │
│   - psa                         │          │   - reportcard              │
│   - goodMoral                   │          │   - psa                     │
│ • status                        │          │   - goodMoral               │
│ • interviewSchedule             │          │   - form137                 │
│ • notes                         │          │   - completionCertificate   │
│ • createdAt                     │          │   - clearance               │
│ • formType: "jhs"               │          │ • status                    │
└─────────────────────────────────┘          │ • interviewSchedule         │
                                             │ • notes                     │
                                             │ • createdAt                 │
                                             │ • formType: "shs"           │
                                             └─────────────────────────────┘


┌─────────────────────────────────┐          ┌─────────────────────────────┐
│      announcements              │          │      enrollment             │
├─────────────────────────────────┤          ├─────────────────────────────┤
│ [auto-generated ID]             │          │ [custom ID]                 │
│ • title                         │          │ • isOpen                    │
│ • content                       │          │ • startDate                 │
│ • author                        │          │ • endDate                   │
│ • authorUid (→ users)           │          │ • schoolYear                │
│ • category                      │          │ • currentGradeLevels []     │
│ • imageUrl                      │          │ • maxStudents               │
│ • isPublished                   │          │ • createdAt                 │
│ • publishedAt                   │          │ • updatedAt                 │
│ • createdAt                     │          └─────────────────────────────┘
│ • updatedAt                     │
└─────────────────────────────────┘
```

---

## Firebase Storage Buckets

```
┌─────────────────────────────────────────────────────────────────────┐
│                      FIREBASE STORAGE                               │
│                   (File Storage System)                             │
└─────────────────────────────────────────────────────────────────────┘

/requirements/
├── {applicantId}/                    ← Links to jhsApplicants/shsApplicants
│   ├── reportcard.pdf
│   ├── psa.pdf
│   ├── goodMoral.pdf
│   ├── form137.pdf
│   └── clearance.pdf

/teacher-documents/
├── {applicantId}/                    ← Links to teacherApplicants
│   ├── resume.pdf
│   ├── certificate1.pdf
│   ├── certificate2.pdf
│   └── validId.jpg

/message-attachments/
├── {messageId}/                      ← Links to applicant_messages
│   └── attachment.pdf

/announcements/
├── {announcementId}/                 ← Links to announcements
│   └── image.jpg
```

**How Storage Links to Firestore:**

1. File is uploaded to Storage → Get download URL
2. URL is saved in Firestore document field
3. Example:
   ```javascript
   {
     requirements: {
       reportcard: {
         url: "https://firebasestorage.googleapis.com/...",
         checked: false
       }
     }
   }
   ```

---

## Data Flow Diagrams

### 1. Student Application Flow (JHS/SHS)

```
┌──────────┐
│  Student │
└────┬─────┘
     │
     │ 1. Fill application form
     │
     ▼
┌─────────────────┐
│  Frontend Form  │
└────┬────────────┘
     │
     │ 2. Upload files to Firebase Storage
     │    (/requirements/{applicantId}/...)
     │
     ▼
┌──────────────────┐
│ Firebase Storage │
└────┬─────────────┘
     │
     │ 3. Get file download URLs
     │
     ▼
┌────────────────────┐
│  POST /api/submit  │
│  -application      │
└────┬───────────────┘
     │
     │ 4. Save to jhsApplicants or shsApplicants
     │
     ▼
┌──────────────────┐
│    Firestore     │
│  jhsApplicants/  │
│  shsApplicants/  │
└──────────────────┘
```

---

### 2. Teacher Application Flow (With Email Verification)

```
┌─────────────┐
│   Teacher   │
└──────┬──────┘
       │
       │ 1. Fill application form
       │
       ▼
┌────────────────────┐
│  Frontend Form     │
└────┬───────────────┘
     │
     │ 2. POST /applicants/create
     │    (No auth yet - anonymous)
     │
     ▼
┌─────────────────────────┐
│  Server creates:        │
│  • teacherApplicants    │ ◄─── Status: "pending"
│  • email_confirmations  │
└────┬────────────────────┘
     │
     │ 3. POST /applicants/send-code
     │    (Send OTP to email)
     │
     ▼
┌────────────────────┐
│   Email Service    │
│   (Resend API)     │
└────┬───────────────┘
     │
     │ 4. User enters OTP
     │
     ▼
┌─────────────────────────────┐
│ POST /applicants/confirm    │
│ • Verify OTP                │
│ • Create Firebase Auth user │
│ • Create users/{uid}        │
│ • Update teacherApplicants  │ ◄─── Status: "submitted"
└─────────────────────────────┘
```

---

### 3. Admin-Applicant Messaging Flow

```
┌───────┐                                          ┌─────────────┐
│ Admin │                                          │  Applicant  │
└───┬───┘                                          └──────┬──────┘
    │                                                     │
    │ 1. Send message                                     │
    │                                                     │
    ▼                                                     │
┌──────────────────────────┐                             │
│ POST /api/admin/send     │                             │
│ • Validate admin role    │                             │
│ • Check email match      │                             │
│ • Save to applicant_     │                             │
│   messages               │                             │
│ • Send email via Resend  │ ──────────────────────────► │
│ • Create notification    │                             │
│ • Log activity           │                             │
└──────────────────────────┘                             │
                                                          │
                                                          │ 2. View messages
                                                          │
    ┌─────────────────────────────────────────────────────┘
    │
    ▼
┌────────────────────────────┐
│ GET /teacher-messages/list │
│ • Find applicantId by uid  │
│ • Fetch messages           │
│ • Return sorted list       │
└────────────────────────────┘
```

---

### 4. Authentication & Authorization Flow

```
┌────────┐
│  User  │
└────┬───┘
     │
     │ 1. Login (email + password)
     │
     ▼
┌─────────────────────────┐
│  Frontend login.js      │
│  signInWithEmailAndPwd  │
└────┬────────────────────┘
     │
     │ 2. Get ID Token
     │
     ▼
┌────────────────────────┐
│ POST /auth/login       │
│ • Verify token         │
│ • Check role in users/ │ ◄──── Firestore: users/{uid}
│ • Check forcePassword  │
│   Change               │
└────┬───────────────────┘
     │
     ├──── If Admin + OTP enabled ────►┌──────────────────┐
     │                                  │ Generate OTP     │
     │                                  │ Send via Resend  │
     │                                  │ Redirect to OTP  │
     │                                  └──────────────────┘
     │
     ├──── If forcePasswordChange ────►┌──────────────────┐
     │                                  │ Redirect to      │
     │                                  │ changepass.html  │
     │                                  └──────────────────┘
     │
     └──── Normal login ──────────────►┌──────────────────┐
                                        │ Set HTTP-only    │
                                        │ session cookie   │
                                        │ Redirect to      │
                                        │ dashboard        │
                                        └──────────────────┘
```

---

## Collection Relationships Summary

| Collection | Related To | Relationship Type | Link Field |
|------------|-----------|-------------------|------------|
| `users` | Firebase Auth | 1:1 | `uid` (same as Auth UID) |
| `teacherApplicants` | `users` | 1:1 | `uid` → `users.uid` |
| `email_confirmations` | `teacherApplicants` | 1:1 | Document ID = `applicationId` |
| `applicant_messages` | `teacherApplicants` | Many:1 | `applicantId` → `teacherApplicants.id` |
| `applicant_messages` | `users` | Many:1 | `fromUid` → `users.uid` |
| `notifications` | `applicant_messages` | 1:1 | `messageId` → `applicant_messages.id` |
| `notifications` | `teacherApplicants` | Many:1 | `applicantId` → `teacherApplicants.id` |
| `activity_logs` | `users` | Many:1 | `actorUid` → `users.uid` |
| `announcements` | `users` | Many:1 | `authorUid` → `users.uid` |

---

## Indexes Required

### Composite Indexes (for complex queries):

1. **applicant_messages**
   - Fields: `applicantId` (ASC) + `createdAt` (ASC)
   - Used for: Fetching messages for an applicant in chronological order

2. **applicant_messages** (Archive cleanup)
   - Fields: `isArchived` (ASC) + `archivedAt` (ASC)
   - Used for: Auto-deleting old archived messages

3. **teacherApplicants** (Auto-deletion)
   - Fields: `status` (ASC) + `createdAt` (ASC)
   - Used for: Finding expired pending applications

4. **teacherApplicants** (UID lookup)
   - Field: `uid` (ASC)
   - Used for: Finding applicant by auth UID

---

## Security Model

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                          │
└─────────────────────────────────────────────────────────────┘

Layer 1: Firebase Security Rules
├── Firestore: ALL read/write = false
├── Storage: Custom rules (not shown in current files)
└── All access MUST go through backend server

Layer 2: Backend API Authentication
├── JWT Token Verification
├── Session Cookie Verification
└── Firebase Admin SDK

Layer 3: Role-Based Access Control (RBAC)
├── Admin-only routes: requireAdmin middleware
├── Applicant-only routes: Check uid matches
└── Public routes: Limited to specific endpoints

Layer 4: Data Validation
├── Email format validation
├── Required fields check
├── File type/size limits
└── Business rule enforcement

Layer 5: Rate Limiting
├── OTP resend: 3 per hour
├── OTP cooldown: 3 minutes
└── Login attempts: Firebase default limits

Layer 6: Audit Logging
├── All admin actions logged
├── Timestamp + actor tracking
└── Activity logs collection
```

---

## Database Maintenance & Cleanup

### Automated Jobs (Cron Schedule)

**Daily at 2:00 AM Asia/Manila Time:**

1. **Teacher Account Cleanup**
   ```javascript
   DELETE teacherApplicants WHERE:
   - status = "pending"
   - createdAt < 30 days ago
   - Also delete from Firebase Auth
   ```

2. **Archived Messages Cleanup**
   ```javascript
   DELETE applicant_messages WHERE:
   - isArchived = true
   - archivedAt < 60 days ago
   ```

---

## Performance Optimizations

1. **Denormalization**: Store display names to avoid joins
2. **Indexed Queries**: Create composite indexes for common queries
3. **Pagination**: Limit query results for large collections
4. **Soft Deletes**: Mark as deleted instead of removing immediately
5. **Firestore Limits**:
   - Max document size: 1 MB
   - Max field name length: 1500 bytes
   - Max array elements: 20,000

---

**Created**: October 24, 2025  
**For**: Holy Family Academy School Portal Database Defense
