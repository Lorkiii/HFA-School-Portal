/**
 * Teacher Messages Route
 * Handles sending messages to teacher applicants via email
 */

import express from 'express';
import { sendEmail, createEmailTemplate } from '../utils/emailService.js';

export default function createTeacherMessagesRouter(deps = {}) {
  const { db, mailTransporter, requireAdmin, writeActivityLog } = deps;
  const router = express.Router();

  /**
   * POST /:id/send-message
   * Send an email message to a teacher applicant
   * Admin only endpoint
   */
  router.post('/:id/send-message', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { recipient, subject, body } = req.body;

    // Validation
    if (!recipient || !subject || !body) {
      return res.status(400).json({ 
        error: 'Missing required fields: recipient, subject, and body are required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient)) {
      return res.status(400).json({ 
        error: 'Invalid email address format' 
      });
    }

    try {
      // Get applicant details (optional - for logging)
      let applicantName = 'Applicant';
      if (db) {
        try {
          const docRef = db.collection('teacherApplicants').doc(id);
          const doc = await docRef.get();
          if (doc.exists) {
            const data = doc.data();
            applicantName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
          }
        } catch (dbErr) {
          console.warn('[teacher-messages] Could not fetch applicant details:', dbErr.message);
        }
      }

      // Create formatted email content
      const emailHtml = createEmailTemplate({
        title: subject,
        content: `<div style="white-space: pre-wrap;">${body}</div>`,
        footer: 'This message was sent from the Holy Family Academy Admin Portal. If you have questions, please contact the administration office.'
      });

      // Send email
      await sendEmail(mailTransporter, {
        to: recipient,
        subject: subject,
        html: emailHtml
      });

      // Log activity
      if (writeActivityLog && req.user) {
        try {
          await writeActivityLog({
            userId: req.user.uid,
            userName: req.user.displayName || req.user.email,
            action: 'message_sent',
            targetType: 'teacher_applicant',
            targetId: id,
            details: {
              recipient,
              subject,
              applicantName
            },
            timestamp: new Date()
          });
        } catch (logErr) {
          console.warn('[teacher-messages] Failed to log activity:', logErr.message);
        }
      }

      console.log(`[teacher-messages] Message sent to ${recipient} (Applicant: ${applicantName})`);

      res.json({ 
        success: true, 
        message: 'Email sent successfully' 
      });

    } catch (error) {
      console.error('[teacher-messages] Error sending message:', error);
      
      // Return user-friendly error
      const errorMessage = error.message || 'Failed to send email';
      res.status(500).json({ 
        error: errorMessage.includes('transporter') 
          ? 'Email service is not configured. Please contact the system administrator.'
          : 'Failed to send message. Please try again later.' 
      });
    }
  });

  return router;
}
