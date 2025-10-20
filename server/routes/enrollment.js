import express from 'express';

export default function createEnrollmentRouter(deps = {}) {
  const { db, requireAdmin } = deps;
  const router = express.Router();

  // GET /api/enrollment/status - Public endpoint to check if enrollment is open
  router.get('/status', async (req, res) => {
    try {
      const doc = await db.collection('settings').doc('enrollment').get();
      
      if (!doc.exists) {
        // Default: both closed
        return res.json({
          jhs: { status: 'closed', startDate: null, endDate: null },
          shs: { status: 'closed', startDate: null, endDate: null }
        });
      }

      const data = doc.data();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Calculate JHS status
      const jhsStart = data.jhs?.startDate ? new Date(data.jhs.startDate) : null;
      const jhsEnd = data.jhs?.endDate ? new Date(data.jhs.endDate) : null;
      const jhsStatus = calculateStatus(today, jhsStart, jhsEnd);

      // Calculate SHS status
      const shsStart = data.shs?.startDate ? new Date(data.shs.startDate) : null;
      const shsEnd = data.shs?.endDate ? new Date(data.shs.endDate) : null;
      const shsStatus = calculateStatus(today, shsStart, shsEnd);

      return res.json({
        jhs: {
          status: jhsStatus.status,
          startDate: data.jhs?.startDate || null,
          endDate: data.jhs?.endDate || null,
          daysRemaining: jhsStatus.daysRemaining
        },
        shs: {
          status: shsStatus.status,
          startDate: data.shs?.startDate || null,
          endDate: data.shs?.endDate || null,
          daysRemaining: shsStatus.daysRemaining
        }
      });
    } catch (err) {
      console.error('Error fetching enrollment status:', err);
      return res.status(500).json({ error: 'Failed to fetch enrollment status' });
    }
  });

  // GET /api/enrollment/settings - Admin only
  router.get('/settings', requireAdmin, async (req, res) => {
    try {
      const doc = await db.collection('settings').doc('enrollment').get();
      
      if (!doc.exists) {
        return res.json({
          jhs: { startDate: '', endDate: '' },
          shs: { startDate: '', endDate: '' }
        });
      }

      return res.json(doc.data());
    } catch (err) {
      console.error('Error fetching enrollment settings:', err);
      return res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  // PUT /api/enrollment/settings - Admin only
  router.put('/settings', requireAdmin, async (req, res) => {
    try {
      const { jhs, shs } = req.body;

      // Validate dates
      if (!jhs?.startDate || !jhs?.endDate || !shs?.startDate || !shs?.endDate) {
        return res.status(400).json({ error: 'All dates are required' });
      }

      // Validate date order
      if (new Date(jhs.startDate) > new Date(jhs.endDate)) {
        return res.status(400).json({ error: 'JHS start date must be before end date' });
      }
      if (new Date(shs.startDate) > new Date(shs.endDate)) {
        return res.status(400).json({ error: 'SHS start date must be before end date' });
      }

      const data = {
        jhs: {
          startDate: jhs.startDate,
          endDate: jhs.endDate
        },
        shs: {
          startDate: shs.startDate,
          endDate: shs.endDate
        },
        updatedAt: new Date().toISOString(),
        updatedBy: req.user?.email || 'admin'
      };

      await db.collection('settings').doc('enrollment').set(data, { merge: true });

      return res.json({ ok: true, message: 'Enrollment settings updated successfully' });
    } catch (err) {
      console.error('Error updating enrollment settings:', err);
      return res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  return router;
}

// Helper function to calculate enrollment status
function calculateStatus(today, startDate, endDate) {
  if (!startDate || !endDate) {
    return { status: 'closed', daysRemaining: 0 };
  }

  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  if (today < startDate) {
    // Not started yet
    const daysUntil = Math.ceil((startDate - today) / (1000 * 60 * 60 * 24));
    return { status: 'upcoming', daysRemaining: daysUntil };
  } else if (today > endDate) {
    // Already ended
    return { status: 'closed', daysRemaining: 0 };
  } else {
    // Currently open
    const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
    return { status: 'open', daysRemaining: daysLeft };
  }
}
