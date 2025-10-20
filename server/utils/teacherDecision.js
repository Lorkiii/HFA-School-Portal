// Teacher Final Decision Handler
// Handles approve/reject and sends appropriate emails

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Process final decision (approve or reject)
 * @param {Object} params
 * @param {string} params.applicantId - Applicant ID
 * @param {Object} params.applicantData - Applicant data from Firestore
 * @param {string} params.decision - 'approved' or 'rejected'
 * @param {Object} params.db - Firestore database instance
 * @param {Object} params.mailTransporter - Nodemailer transporter
 * @returns {Promise<Object>} Result object
 */
export async function processFinalDecision({ applicantId, applicantData, decision, db, mailTransporter }) {
  try {
    // Validate decision
    if (decision !== 'approved' && decision !== 'rejected') {
      throw new Error('Invalid decision. Must be "approved" or "rejected"');
    }

    // Calculate deletion date (30 days from now)
    const now = new Date();
    const deletionDate = new Date(now);
    deletionDate.setDate(deletionDate.getDate() + 30);

    // Prepare update data
    const updateData = {
      finalDecision: decision,
      finalDecisionDate: now,
      deletionDate: deletionDate,
      updatedAt: now
    };

    // If approved, set status to archived
    if (decision === 'approved') {
      updateData.status = 'archived';
    }

    // Update Firestore
    await db.collection('teacherApplicants').doc(applicantId).update(updateData);

    // Send email
    const emailSent = await sendDecisionEmail({
      decision,
      applicantData,
      mailTransporter
    });

    return {
      success: true,
      decision,
      deletionDate: deletionDate.toISOString(),
      emailSent
    };

  } catch (error) {
    console.error('Error processing final decision:', error);
    throw error;
  }
}

/**
 * Send email based on decision
 * @param {Object} params
 * @param {string} params.decision - 'approved' or 'rejected'
 * @param {Object} params.applicantData - Applicant data
 * @param {Object} params.mailTransporter - Nodemailer transporter
 * @returns {Promise<boolean>} True if email sent successfully
 */
async function sendDecisionEmail({ decision, applicantData, mailTransporter }) {
  try {
    // Read email template
    const templateName = decision === 'approved' ? 'teacher-approved.html' : 'teacher-rejected.html';
    // getting the the teacher-approved and teacher-rejected.html in templates folder
    const templatePath = join(__dirname, '..', 'templates', templateName); 
    let htmlTemplate = readFileSync(templatePath, 'utf-8');

    // Replace placeholders
    const applicantName = applicantData.fullName || applicantData.firstName + ' ' + applicantData.lastName || 'Teacher Applicant';
    const contactPhone = process.env.SCHOOL_CONTACT_PHONE || '0932-627-1836';
    const contactEmail = process.env.SCHOOL_CONTACT_EMAIL || 'holyfamilyacademyofsmbinc@gmail.com';

    htmlTemplate = htmlTemplate
      .replace(/{{name}}/g, applicantName)
      .replace(/{{contactPhone}}/g, contactPhone)
      .replace(/{{contactEmail}}/g, contactEmail);

    // Email subject
    const subject = decision === 'approved' 
      ? 'Congratulations - Teacher Application Approved'
      : 'Teacher Application Update';

    // Send email
    const mailOptions = {
      from: `"Holy Family Academy" <${process.env.SMTP_USER || 'noreply@hfa.edu'}>`,
      to: applicantData.email,
      subject: subject,
      html: htmlTemplate
    };

    await mailTransporter.sendMail(mailOptions);
    console.log(`✅ ${decision} email sent to ${applicantData.email}`);
    return true;

  } catch (error) {
    console.error('Error sending decision email:', error);
    // Don't throw - decision was saved, email failure shouldn't break the flow
    return false;
  }
}

/**
 * Check and delete expired accounts (Run this daily via cron)
 * @param {Object} params
 * @param {Object} params.db - Firestore database instance
 * @param {Function} params.writeActivityLog - Activity log function (optional)
 * @returns {Promise<Object>} Result with deleted count
 */
export async function deleteExpiredAccounts({ db, writeActivityLog }) {
  try {
    const now = new Date();
    
    // Find all applicants with deletionDate in the past
    const snapshot = await db.collection('teacherApplicants')
      .where('deletionDate', '<=', now)
      .get();

    if (snapshot.empty) {
      console.log('No expired accounts to delete.');
      return { success: true, deletedCount: 0 };
    }

    // Delete each expired account and log activity
    const batch = db.batch();
    let count = 0;
    const deletedApplicants = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      batch.delete(doc.ref);
      count++;
      deletedApplicants.push({
        id: doc.id,
        name: data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
        email: data.email,
        finalDecision: data.finalDecision || 'unknown'
      });
      console.log(`🗑️ Scheduling deletion for: ${doc.id} (${data.email})`);
    });

    // Commit batch deletion
    await batch.commit();
    console.log(`✅ Deleted ${count} expired teacher applicant account(s)`);

    // Log activity for each deleted account (if writeActivityLog is provided)
    if (writeActivityLog && typeof writeActivityLog === 'function') {
      for (const applicant of deletedApplicants) {
        try {
          await writeActivityLog({
            actionType: 'teacher_account_deleted',
            performedBy: 'system',
            performedByEmail: 'system@auto-delete',
            targetId: applicant.id,
            targetType: 'teacherApplicant',
            details: {
              applicantName: applicant.name,
              applicantEmail: applicant.email,
              reason: 'auto_expired',
              finalDecision: applicant.finalDecision,
              deletionDate: now
            },
            timestamp: now
          });
        } catch (logErr) {
          console.error(`Failed to log deletion for ${applicant.id}:`, logErr.message);
        }
      }
    }

    return { success: true, deletedCount: count };

  } catch (error) {
    console.error('Error deleting expired accounts:', error);
    return { success: false, error: error.message, deletedCount: 0 };
  }
}
