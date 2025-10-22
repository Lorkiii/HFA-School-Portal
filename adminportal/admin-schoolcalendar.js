import { apiFetch } from '../api-fetch.js';
import { db } from '../firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let calendar = null;

// Initialize calendar when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  initializeCalendar();
});

// Initialize FullCalendar with simple configuration
function initializeCalendar() {
  const calendarEl = document.getElementById('calendar');
  
  if (!calendarEl) {
    console.error('Calendar element not found');
    return;
  }

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,dayGridWeek'
    },
    height: 'auto',
    events: fetchCalendarEvents,
    eventDisplay: 'block',
    displayEventTime: false,
    eventClick: function(info) {
      // Simple display of event details
      showEventDetails(info.event);
    }
  });

  calendar.render();
}

// Fetch all calendar events from different sources
async function fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
  try {
    const events = [];

    // Fetch announcements and news
    const announcementsData = await fetchAnnouncements();
    events.push(...announcementsData);

    // Fetch enrollment periods
    const enrollmentData = await fetchEnrollmentPeriods();
    events.push(...enrollmentData);

    // Fetch interview schedules
    const interviewData = await fetchInterviews();
    events.push(...interviewData);

    successCallback(events);
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    failureCallback(error);
  }
}

// Fetch announcements and news from API
async function fetchAnnouncements() {
  try {
    const response = await apiFetch('/api/announcements?includeArchived=false');
    
    if (!response.ok || !response.posts) {
      return [];
    }

    // Map announcements to calendar events
    return response.posts.map(post => {
      const isNews = post.type === 'news';
      return {
        id: `ann-${post.id}`,
        title: post.title,
        start: post.createdAt,
        allDay: true,
        backgroundColor: isNews ? '#3b82f6' : '#f59e0b', // Blue for news, amber for announcements
        borderColor: isNews ? '#2563eb' : '#d97706',
        textColor: '#ffffff',
        extendedProps: {
          type: isNews ? 'news' : 'announcement',
          body: post.body,
          category: post.category,
          createdBy: post.createdByName
        }
      };
    });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    return [];
  }
}

// Fetch enrollment periods from API
async function fetchEnrollmentPeriods() {
  try {
    const response = await apiFetch('/api/enrollment/settings');
    
    if (!response) {
      return [];
    }

    const events = [];

    // Add JHS enrollment period
    if (response.jhs?.startDate && response.jhs?.endDate) {
      events.push({
        id: 'enroll-jhs',
        title: '📚 JHS Enrollment Period',
        start: response.jhs.startDate,
        end: addDays(response.jhs.endDate, 1), // Add 1 day for inclusive end date
        allDay: true,
        backgroundColor: '#8b5cf6',
        borderColor: '#7c3aed',
        textColor: '#ffffff',
        extendedProps: {
          type: 'enrollment',
          level: 'JHS'
        }
      });
    }

    // Add SHS enrollment period
    if (response.shs?.startDate && response.shs?.endDate) {
      events.push({
        id: 'enroll-shs',
        title: '🎓 SHS Enrollment Period',
        start: response.shs.startDate,
        end: addDays(response.shs.endDate, 1), // Add 1 day for inclusive end date
        allDay: true,
        backgroundColor: '#ec4899',
        borderColor: '#db2777',
        textColor: '#ffffff',
        extendedProps: {
          type: 'enrollment',
          level: 'SHS'
        }
      });
    }

    return events;
  } catch (error) {
    console.error('Error fetching enrollment periods:', error);
    return [];
  }
}

// Fetch interview schedules from Firestore
async function fetchInterviews() {
  try {
    if (!db) {
      console.warn('Firestore not initialized');
      return [];
    }

    // Fetch all teacher applicants from Firestore
    const querySnapshot = await getDocs(collection(db, 'teacherApplicants'));
    
    const interviews = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Only include if interview is scheduled and has date/time
      if (data.interview && data.interview.date && data.interview.time) {
        const interviewDate = data.interview.date;
        const interviewTime = data.interview.time || '09:00';
        
        // Combine date and time
        const dateTimeStr = `${interviewDate}T${interviewTime}:00`;
        
        interviews.push({
          id: `interview-${doc.id}`,
          title: `🎤 Interview: ${data.displayName || data.name || 'Applicant'}`,
          start: dateTimeStr,
          allDay: false,
          backgroundColor: '#10b981',
          borderColor: '#059669',
          textColor: '#ffffff',
          extendedProps: {
            type: 'interview',
            applicantName: data.displayName || data.name,
            applicantEmail: data.contactEmail || data.email,
            mode: data.interview.mode,
            location: data.interview.location,
            notes: data.interview.notes,
            status: data.status
          }
        });
      }
    });

    console.log(`[Calendar] Found ${interviews.length} scheduled interviews`);
    return interviews;
  } catch (error) {
    console.error('Error fetching interviews from Firestore:', error);
    return [];
  }
}

// Helper: Add days to a date string
function addDays(dateStr, days) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

// Show event details in a simple alert/modal
function showEventDetails(event) {
  const props = event.extendedProps;
  let message = `${event.title}\n\n`;

  // Add type-specific details
  if (props.type === 'announcement' || props.type === 'news') {
    message += `Type: ${props.type.toUpperCase()}\n`;
    message += `Category: ${props.category || 'N/A'}\n`;
    message += `Posted by: ${props.createdBy || 'Admin'}\n\n`;
    message += `Content:\n${props.body || 'No content'}`;
  } else if (props.type === 'enrollment') {
    message += `Level: ${props.level}\n`;
    message += `Start: ${formatDate(event.start)}\n`;
    message += `End: ${formatDate(new Date(event.end.getTime() - 86400000))}`; // Subtract 1 day for display
  } else if (props.type === 'interview') {
    message += `Applicant: ${props.applicantName || 'N/A'}\n`;
    message += `Email: ${props.applicantEmail || 'N/A'}\n`;
    message += `Time: ${formatDateTime(event.start)}\n`;
    if (props.mode) message += `Mode: ${props.mode}\n`;
    if (props.location) message += `Location: ${props.location}\n`;
    if (props.notes) message += `\nNotes:\n${props.notes}`;
  }

  alert(message);
}

// Format date for display
function formatDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Format date and time for display
function formatDateTime(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}