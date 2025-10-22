// adminportal/admin-mail.js
// Admin Mail System - Handle inbox, sent, archived, and compose functionality

import { apiFetch } from '../api-fetch.js';

// State management
let currentTab = 'inbox';
let allMessages = [];
let selectedRecipients = [];
let selectedAttachment = null;
let searchTimeout = null;

// DOM elements
const mailSection = document.getElementById('mail');
const mailList = document.getElementById('mail-list');
const mailEmpty = document.getElementById('mail-empty');
const mailTabs = document.querySelectorAll('.mail-tab');
const btnCompose = document.getElementById('btn-compose-mail');
const composeModal = document.getElementById('compose-mail-modal');
const btnSendMail = document.getElementById('btn-send-mail');
const btnCancelCompose = document.getElementById('btn-cancel-compose');

// Initialize mail system
export function initializeMail() {
  console.log('[Mail] Initializing mail system');
  
  // Set up event listeners
  setupEventListeners();
  
  // Load inbox by default when mail section is shown
  if (mailSection && mailSection.style.display !== 'none') {
    loadMessages('inbox');
  }
}

// Setup all event listeners
function setupEventListeners() {
  // Tab switching
  mailTabs.forEach(tab => {
    tab.addEventListener('click', () => handleTabClick(tab));
  });
  
  // Compose button
  if (btnCompose) {
    btnCompose.addEventListener('click', openComposeModal);
  }
  
  // Compose modal buttons
  if (btnSendMail) {
    btnSendMail.addEventListener('click', handleSendMail);
  }
  if (btnCancelCompose) {
    btnCancelCompose.addEventListener('click', closeComposeModal);
  }
  
  // Recipient search
  const recipientSearch = document.getElementById('recipient-search');
  if (recipientSearch) {
    recipientSearch.addEventListener('input', handleRecipientSearch);
  }
  
  // Attachment handling
  const attachmentInput = document.getElementById('mail-attachment');
  if (attachmentInput) {
    attachmentInput.addEventListener('change', handleAttachmentSelect);
  }
  
  const btnRemoveAttachment = document.getElementById('btn-remove-attachment');
  if (btnRemoveAttachment) {
    btnRemoveAttachment.addEventListener('click', handleRemoveAttachment);
  }
}

// Handle tab click
function handleTabClick(tab) {
  const tabName = tab.getAttribute('data-tab');
  
  // Update active tab
  mailTabs.forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  
  // Update current tab and load messages
  currentTab = tabName;
  loadMessages(tabName);
}

// Load messages based on tab
async function loadMessages(tab) {
  try {
    console.log(`[Mail] Loading messages for ${tab} tab`);
    
    // Show loading state
    if (mailList) mailList.innerHTML = '<p style="text-align: center; padding: 20px;">Loading...</p>';
    if (mailEmpty) mailEmpty.style.display = 'none';
    
    let endpoint = '';
    if (tab === 'inbox') {
      endpoint = '/api/admin/mail/inbox';
    } else if (tab === 'sent') {
      endpoint = '/api/admin/mail/sent';
    } else if (tab === 'archived') {
      endpoint = '/api/admin/mail/archived';
    }
    
    const response = await apiFetch(endpoint);
    
    if (response.ok && response.messages) {
      allMessages = response.messages;
      renderMessages(allMessages, tab);
    } else {
      throw new Error(response.error || 'Failed to fetch messages');
    }
    
  } catch (error) {
    console.error('[Mail] Error loading messages:', error);
    if (mailList) mailList.innerHTML = '';
    showEmptyState('Error loading messages');
  }
}

// Render messages in the list
function renderMessages(messages, tab) {
  if (!mailList) return;
  
  // Clear list
  mailList.innerHTML = '';
  
  // Show empty state if no messages
  if (!messages || messages.length === 0) {
    showEmptyState(getEmptyMessage(tab));
    return;
  }
  
  // Hide empty state
  if (mailEmpty) mailEmpty.style.display = 'none';
  
  // Get template
  const template = document.getElementById('mail-item-template');
  if (!template) return;
  
  // Render each message
  messages.forEach(message => {
    const clone = template.content.cloneNode(true);
    const item = clone.querySelector('.mail-item');
    
    // Set data
    item.setAttribute('data-id', message.id);
    
    // Sender/Recipients info
    const senderEl = clone.querySelector('.mail-sender');
    if (tab === 'sent') {
      // Show recipients for sent messages
      const recipients = message.to || [];
      const recipientNames = recipients.map(r => r.name || r.email).join(', ');
      senderEl.textContent = `To: ${recipientNames || 'Unknown'}`;
    } else {
      // Show sender for inbox/archived
      senderEl.textContent = message.senderName || 'Unknown';
    }
    
    // Subject
    const subjectEl = clone.querySelector('.mail-subject');
    subjectEl.textContent = message.subject || '(No Subject)';
    
    // Preview (first 100 chars of body)
    const previewEl = clone.querySelector('.mail-preview');
    const bodyPreview = (message.body || '').substring(0, 100);
    previewEl.textContent = bodyPreview + (message.body && message.body.length > 100 ? '...' : '');
    
    // Date
    const dateEl = clone.querySelector('.mail-date');
    dateEl.textContent = formatDate(message.createdAt || message.sentAt || message.archivedAt);
    
    // Archive button (only for inbox tab)
    const archiveBtn = clone.querySelector('.btn-mail-archive');
    if (tab === 'inbox') {
      archiveBtn.style.display = 'block';
      archiveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleArchiveMessage(message.id);
      });
    } else {
      archiveBtn.style.display = 'none';
    }
    
    // Click to expand/view details
    item.addEventListener('click', () => handleViewMessage(message, tab));
    
    mailList.appendChild(clone);
  });
}

// Show empty state
function showEmptyState(message) {
  if (mailEmpty) {
    mailEmpty.style.display = 'block';
    const emptyMessage = mailEmpty.querySelector('p');
    if (emptyMessage) {
      emptyMessage.textContent = message;
    }
  }
}

// Get empty message based on tab
function getEmptyMessage(tab) {
  if (tab === 'inbox') return 'No messages in your inbox';
  if (tab === 'sent') return 'No sent messages';
  if (tab === 'archived') return 'No archived messages';
  return 'No messages';
}

// Handle view message (expand inline or modal)
function handleViewMessage(message, tab) {
  // Simple alert for now - you can enhance this with a modal
  let details = `From: ${message.senderName || 'Unknown'}\n`;
  details += `Subject: ${message.subject || '(No Subject)'}\n`;
  details += `Date: ${formatDate(message.createdAt || message.sentAt)}\n\n`;
  details += `Message:\n${message.body || ''}`;
  
  if (tab === 'sent' && message.attachment) {
    details += `\n\nAttachment: ${message.attachment.filename}`;
  }
  
  alert(details);
}

// Handle archive message
async function handleArchiveMessage(messageId) {
  if (!confirm('Archive this message? It will be automatically deleted after 60 days.')) {
    return;
  }
  
  try {
    const response = await apiFetch(`/api/admin/mail/${messageId}/archive`, {
      method: 'PUT'
    });
    
    if (response.ok) {
      alert('Message archived successfully');
      // Reload current tab
      loadMessages(currentTab);
    } else {
      throw new Error(response.error || 'Failed to archive message');
    }
  } catch (error) {
    console.error('[Mail] Error archiving message:', error);
    alert('Failed to archive message: ' + error.message);
  }
}

// Open compose modal
function openComposeModal() {
  if (!composeModal) return;
  
  // Reset form
  resetComposeForm();
  
  // Show modal
  composeModal.style.display = 'flex';
  composeModal.setAttribute('aria-hidden', 'false');
}

// Close compose modal
function closeComposeModal() {
  if (!composeModal) return;
  
  composeModal.style.display = 'none';
  composeModal.setAttribute('aria-hidden', 'true');
  
  // Reset form
  resetComposeForm();
}

// Reset compose form
function resetComposeForm() {
  // Clear recipients
  selectedRecipients = [];
  updateSelectedRecipients();
  
  // Clear fields
  const recipientSearch = document.getElementById('recipient-search');
  const mailSubject = document.getElementById('mail-subject');
  const mailBody = document.getElementById('mail-body');
  const attachmentInput = document.getElementById('mail-attachment');
  
  if (recipientSearch) recipientSearch.value = '';
  if (mailSubject) mailSubject.value = '';
  if (mailBody) mailBody.value = '';
  if (attachmentInput) attachmentInput.value = '';
  
  // Clear attachment
  selectedAttachment = null;
  const attachmentPreview = document.getElementById('attachment-preview');
  if (attachmentPreview) attachmentPreview.style.display = 'none';
  
  // Hide search results
  const recipientResults = document.getElementById('recipient-results');
  if (recipientResults) recipientResults.style.display = 'none';
}

// Handle recipient search with debounce
function handleRecipientSearch(e) {
  const query = e.target.value.trim();
  
  // Clear previous timeout
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  
  // Hide results if empty
  const recipientResults = document.getElementById('recipient-results');
  if (!query) {
    if (recipientResults) recipientResults.style.display = 'none';
    return;
  }
  
  // Debounce search (wait 300ms after user stops typing)
  searchTimeout = setTimeout(async () => {
    try {
      const response = await apiFetch(`/api/admin/mail/users/search?q=${encodeURIComponent(query)}`);
      
      if (response.ok && response.users) {
        displaySearchResults(response.users);
      }
    } catch (error) {
      console.error('[Mail] Error searching users:', error);
    }
  }, 300);
}

// Display search results
function displaySearchResults(users) {
  const recipientResults = document.getElementById('recipient-results');
  if (!recipientResults) return;
  
  // Clear previous results
  recipientResults.innerHTML = '';
  
  if (!users || users.length === 0) {
    recipientResults.innerHTML = '<div class="recipient-result-item">No users found</div>';
    recipientResults.style.display = 'block';
    return;
  }
  
  // Display each user
  users.forEach(user => {
    // Skip if already selected
    if (selectedRecipients.find(r => r.uid === user.uid)) {
      return;
    }
    
    const item = document.createElement('div');
    item.className = 'recipient-result-item';
    item.innerHTML = `
      <strong>${user.name}</strong>
      <small>${user.email}</small>
    `;
    item.addEventListener('click', () => addRecipient(user));
    
    recipientResults.appendChild(item);
  });
  
  recipientResults.style.display = 'block';
}

// Add recipient
function addRecipient(user) {
  // Check if already added
  if (selectedRecipients.find(r => r.uid === user.uid)) {
    return;
  }
  
  // Add to selected recipients
  selectedRecipients.push(user);
  
  // Update UI
  updateSelectedRecipients();
  
  // Clear search
  const recipientSearch = document.getElementById('recipient-search');
  if (recipientSearch) recipientSearch.value = '';
  
  // Hide results
  const recipientResults = document.getElementById('recipient-results');
  if (recipientResults) recipientResults.style.display = 'none';
}

// Update selected recipients UI
function updateSelectedRecipients() {
  const container = document.getElementById('selected-recipients');
  if (!container) return;
  
  // Clear container
  container.innerHTML = '';
  
  if (selectedRecipients.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'flex';
  
  // Display each recipient as chip
  selectedRecipients.forEach((recipient, index) => {
    const chip = document.createElement('div');
    chip.className = 'recipient-chip';
    chip.innerHTML = `
      <span>${recipient.name}</span>
      <button type="button" class="chip-remove">&times;</button>
    `;
    
    // Remove button
    const removeBtn = chip.querySelector('.chip-remove');
    removeBtn.addEventListener('click', () => removeRecipient(index));
    
    container.appendChild(chip);
  });
}

// Remove recipient
function removeRecipient(index) {
  selectedRecipients.splice(index, 1);
  updateSelectedRecipients();
}

// Handle attachment select
function handleAttachmentSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  // Validate file size (10MB max)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    alert('File is too large. Maximum size is 10MB.');
    e.target.value = '';
    return;
  }
  
  // Store selected file
  selectedAttachment = file;
  
  // Show preview
  const attachmentPreview = document.getElementById('attachment-preview');
  const attachmentName = document.getElementById('attachment-name');
  const attachmentSize = document.getElementById('attachment-size');
  
  if (attachmentPreview && attachmentName && attachmentSize) {
    attachmentName.textContent = file.name;
    attachmentSize.textContent = `(${formatFileSize(file.size)})`;
    attachmentPreview.style.display = 'flex';
  }
}

// Handle remove attachment
function handleRemoveAttachment() {
  selectedAttachment = null;
  
  const attachmentInput = document.getElementById('mail-attachment');
  const attachmentPreview = document.getElementById('attachment-preview');
  
  if (attachmentInput) attachmentInput.value = '';
  if (attachmentPreview) attachmentPreview.style.display = 'none';
}

// Handle send mail
async function handleSendMail() {
  try {
    // Validate fields
    const mailSubject = document.getElementById('mail-subject');
    const mailBody = document.getElementById('mail-body');
    
    if (!mailSubject || !mailBody) return;
    
    const subject = mailSubject.value.trim();
    const body = mailBody.value.trim();
    
    if (selectedRecipients.length === 0) {
      alert('Please select at least one recipient');
      return;
    }
    
    if (!subject) {
      alert('Please enter a subject');
      mailSubject.focus();
      return;
    }
    
    if (!body) {
      alert('Please enter a message');
      mailBody.focus();
      return;
    }
    
    // Show loading state
    btnSendMail.disabled = true;
    btnSendMail.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    
    // Prepare form data
    const formData = new FormData();
    formData.append('to', JSON.stringify(selectedRecipients));
    formData.append('subject', subject);
    formData.append('body', body);
    
    // Add attachment if selected
    if (selectedAttachment) {
      formData.append('attachment', selectedAttachment);
    }
    
    // Send mail
    const response = await apiFetch('/api/admin/mail/send', {
      method: 'POST',
      body: formData,
      isFormData: true
    });
    
    if (response.ok) {
      alert(`Mail sent successfully to ${response.emailsSent} recipient(s)!`);
      closeComposeModal();
      
      // Reload sent tab
      if (currentTab === 'sent') {
        loadMessages('sent');
      }
    } else {
      throw new Error(response.error || 'Failed to send mail');
    }
    
  } catch (error) {
    console.error('[Mail] Error sending mail:', error);
    alert('Failed to send mail: ' + error.message);
  } finally {
    // Reset button state
    btnSendMail.disabled = false;
    btnSendMail.innerHTML = '<i class="fas fa-paper-plane"></i> Send';
  }
}

// Format date to relative time
function formatDate(dateString) {
  if (!dateString) return 'Unknown date';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

// Format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Initialize when section becomes visible
document.addEventListener('DOMContentLoaded', () => {
  // Watch for navigation to mail section
  const observer = new MutationObserver(() => {
    if (mailSection && mailSection.style.display !== 'none') {
      initializeMail();
    }
  });
  
  if (mailSection) {
    observer.observe(mailSection, { attributes: true, attributeFilter: ['style'] });
  }
});
