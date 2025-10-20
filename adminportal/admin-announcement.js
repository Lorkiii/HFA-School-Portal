(function () {
  'use strict';
  const STORE_KEY = "hfa_announcements";

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function save(list) {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  }
  function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }

  // Mock data for UI preview (temporary - will be replaced with API data)
  function getMockData() {
    return [
      {
        id: "1",
        type: "announcement",
        title: "Parent-Teacher Conference",
        body: "The quarterly parent-teacher conference will be held on June 15, 2024 from 8:00 AM to 5:00 PM. Parents are encouraged to attend and discuss their child's academic progress with teachers.",
        category: "ACADEMIC",
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        createdBy: "admin1",
        createdByName: "Maria Santos",
        imageUrl: null,
        archived: false
      },
      {
        id: "2",
        type: "news",
        title: "STEM Excellence Award",
        body: "Congratulations to our Grade 11 STEM students for winning the Regional Science Fair! The team presented an innovative project on renewable energy solutions.",
        category: "ACADEMIC",
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
        createdBy: "admin2",
        createdByName: "John Dela Cruz",
        imageUrl: null,
        archived: false
      },
      {
        id: "3",
        type: "announcement",
        title: "Enrollment Period Extended",
        body: "Good news! The enrollment period for SY 2024-2025 has been extended until June 30, 2024. Don't miss this opportunity to secure your slot!",
        category: "GENERAL",
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        createdBy: "admin1",
        createdByName: "Maria Santos",
        imageUrl: null,
        archived: false
      },
      {
        id: "4",
        type: "announcement",
        title: "School Intramurals 2024",
        body: "The annual school intramurals will be held from July 10-15, 2024. All students are required to participate in at least one sports event.",
        category: "EVENT",
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
        createdBy: "admin3",
        createdByName: "Ana Reyes",
        imageUrl: null,
        archived: false
      },
      {
        id: "5",
        type: "news",
        title: "New Library Books Arrived",
        body: "The school library has received 200 new books covering various subjects. Students can now borrow them during library hours.",
        category: "GENERAL",
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
        createdBy: "admin2",
        createdByName: "John Dela Cruz",
        imageUrl: null,
        archived: false
      },
      {
        id: "6",
        type: "announcement",
        title: "Archived: Old Announcement",
        body: "This is an archived announcement that will be automatically deleted after 45 days.",
        category: "GENERAL",
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
        createdBy: "admin1",
        createdByName: "Maria Santos",
        imageUrl: null,
        archived: true,
        archivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() // Archived 5 days ago
      }
    ];
  }

  // Format relative time
  function getRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    return date.toLocaleDateString();
  }

  // DASHBOARD PREVIEW RENDER

  function render() {
    const wrap = document.getElementById("announcements-list");
    if (!wrap) return;
    
    // Use mock data for now (will be replaced with API call later)
    const items = getMockData();
    
    // Clear container first
    wrap.innerHTML = "";
    
    // Show empty state if no items
    if (!items.length) {
      const emptyState = document.getElementById("ann-empty-state");
      if (emptyState) {
        emptyState.style.display = "flex";
      }
      return;
    }
    
    // Hide empty state
    const emptyState = document.getElementById("ann-empty-state");
    if (emptyState) {
      emptyState.style.display = "none";
    }
    
    // Render preview items
    items.forEach(item => {
      const previewItem = document.createElement("div");
      previewItem.className = "announcement-preview-item";
      previewItem.dataset.id = item.id;
      
      // Determine icon based on type
      const iconClass = item.type === "news" ? "fa-newspaper" : "fa-bullhorn";
      const iconType = item.type === "news" ? "news" : "announcement";
      
      previewItem.innerHTML = `
        <div class="preview-icon ${iconType}">
          <i class="fas ${iconClass}"></i>
        </div>
        <div class="preview-content">
          <h4 class="preview-title">${escapeHtml(item.title)}</h4>
          <p class="preview-body">${escapeHtml(item.body)}</p>
          <div class="preview-meta">
            <span class="preview-date">
              <i class="far fa-clock"></i> ${getRelativeTime(item.createdAt)}
            </span>
            <span class="preview-badge ${iconType}">${item.type}</span>
          </div>
        </div>
      `;
      
      wrap.appendChild(previewItem);
    });
  }


  // FULL SECTION RENDER LOGIC

  
  // Current filter state
  let currentTab = 'announcement'; // announcement, news, or archived
  let searchQuery = '';
  let categoryFilter = 'all';
  let sortBy = 'newest';

  // Calculate days until auto-deletion for archived items
  function calculateArchiveCountdown(archivedAtString) {
    const archivedDate = new Date(archivedAtString);
    const now = new Date();
    const diffMs = now - archivedDate;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const daysRemaining = 45 - diffDays; // Auto-delete after 45 days
    
    if (daysRemaining <= 0) return 'Deletes soon';
    if (daysRemaining === 1) return 'Deletes in 1 day';
    return `Deletes in ${daysRemaining} days`;
  }

  // Filter and sort items based on current state
  function getFilteredItems() {
    let items = getMockData();
    
    // Filter by tab (type or archived status)
    if (currentTab === 'archived') {
      items = items.filter(item => item.archived === true);
    } else {
      items = items.filter(item => item.archived === false && item.type === currentTab);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item => 
        item.title.toLowerCase().includes(query) || 
        item.body.toLowerCase().includes(query)
      );
    }
    
    // Filter by category
    if (categoryFilter !== 'all') {
      items = items.filter(item => item.category === categoryFilter);
    }
    
    // Sort items
    if (sortBy === 'newest') {
      items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sortBy === 'oldest') {
      items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sortBy === 'title') {
      items.sort((a, b) => a.title.localeCompare(b.title));
    }
    
    return items;
  }

  // Render full section cards
  function renderFullSection() {
    const grid = document.getElementById('ann-grid');
    const emptyState = document.getElementById('ann-empty');
    
    // Safety check: if grid doesn't exist, we're not on the announcements section page
    if (!grid) return;
    
    // Get filtered items
    const items = getFilteredItems();
    
    // Clear grid
    grid.innerHTML = '';
    
    // Show/hide empty state
    if (items.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    } else {
      if (emptyState) emptyState.style.display = 'none';
    }
    
    // Get template
    const template = document.getElementById('ann-card-template');
    if (!template) return;
    
    // Render each item
    items.forEach(item => {
      // Clone template
      const card = template.content.cloneNode(true);
      const cardEl = card.querySelector('.ann-card');
      
      // Set data-id
      cardEl.dataset.id = item.id;
      
      // Handle image
      const imageContainer = card.querySelector('.ann-card-image');
      if (item.imageUrl) {
        imageContainer.classList.add('has-image');
        imageContainer.querySelector('img').src = item.imageUrl;
      } else {
        imageContainer.remove();
      }
      
      // Set badge
      const badge = card.querySelector('.ann-badge');
      badge.textContent = item.type;
      badge.classList.add(item.type);
      
      // Set category badge
      const categoryBadge = card.querySelector('.ann-category-badge');
      categoryBadge.textContent = item.category;
      
      // Set title and body
      card.querySelector('.ann-card-title').textContent = item.title;
      card.querySelector('.ann-card-body').textContent = item.body;
      
      // Set posted by (only show in admin section)
      card.querySelector('.posted-by-name').textContent = item.createdByName;
      
      // Set date
      card.querySelector('.date-text').textContent = getRelativeTime(item.createdAt);
      
      // Handle archive info
      const archiveInfo = card.querySelector('.ann-archive-info');
      if (item.archived && item.archivedAt) {
        archiveInfo.style.display = 'flex';
        archiveInfo.querySelector('.archive-countdown').textContent = calculateArchiveCountdown(item.archivedAt);
      } else {
        archiveInfo.remove();
      }
      
      // Handle action buttons visibility
      const archiveBtn = card.querySelector('.ann-archive-btn');
      const restoreBtn = card.querySelector('.ann-restore-btn');
      
      if (item.archived) {
        // Hide archive button, show restore button
        archiveBtn.style.display = 'none';
        restoreBtn.style.display = 'flex';
      } else {
        // Show archive button, hide restore button
        archiveBtn.style.display = 'flex';
        restoreBtn.style.display = 'none';
      }
      
      // Append to grid
      grid.appendChild(card);
    });
  }

  // Setup tab switching
  function setupTabs() {
    const tabBtns = document.querySelectorAll('.ann-tab-btn');
    
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        // Update active class
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update current tab
        currentTab = btn.dataset.type;
        
        // Re-render
        renderFullSection();
      });
    });
  }

  // Setup search and filters
  function setupFilters() {
    const searchInput = document.getElementById('ann-search');
    const categorySelect = document.getElementById('ann-category-filter');
    const sortSelect = document.getElementById('ann-sort');
    
    // Search input
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        renderFullSection();
      });
    }
    
    // Category filter
    if (categorySelect) {
      categorySelect.addEventListener('change', (e) => {
        categoryFilter = e.target.value;
        renderFullSection();
      });
    }
    
    // Sort select
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        sortBy = e.target.value;
        renderFullSection();
      });
    }
  }
    // opening and and closing the modal
  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.setAttribute("aria-hidden", "false");
  }
  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.setAttribute("aria-hidden", "true");
  }

  function moveViewAll() {
    const viewAll = document.getElementById("view-all-ann") || document.getElementById("view-all-full");
    const header = document.querySelector(".updates-header");
    if (!viewAll || !header) return;
    let headerActions = header.querySelector(".header-actions");
    if (!headerActions) {
      headerActions = document.createElement("div");
      headerActions.className = "header-actions";
      header.appendChild(headerActions);
    }
    headerActions.appendChild(viewAll);
  }

  function init() {
    const postBtn = document.getElementById("post-ann-btn") || document.querySelector(".btn-post");
    const modal = document.getElementById("post-modal");
    const saveBtn = document.getElementById("post-save");
    const cancelBtn = document.getElementById("post-cancel");

    moveViewAll();
    render(); // Render dashboard preview

    if (postBtn && modal) {
      postBtn.addEventListener("click", () => openModal(modal));
    }
    if (cancelBtn && modal) {
      cancelBtn.addEventListener("click", () => closeModal(modal));
    }
    if (saveBtn && modal) {
      saveBtn.addEventListener("click", () => {
        // Get form values
        const titleEl = modal.querySelector("#ann-title");
        const bodyEl = modal.querySelector("#ann-body");
        const categoryEl = modal.querySelector("#ann-category");
        const typeEl = modal.querySelector('input[name="ann-type"]:checked');
        
        const title = titleEl ? titleEl.value.trim() : "";
        const body = bodyEl ? bodyEl.value.trim() : "";
        const category = categoryEl ? categoryEl.value : "";
        const type = typeEl ? typeEl.value : "announcement";
        
        // Validation
        if (!title) { 
          alert("Please enter a title."); 
          if (titleEl) titleEl.focus();
          return; 
        }
        if (!body) { 
          alert("Please enter the content."); 
          if (bodyEl) bodyEl.focus();
          return; 
        }
        if (!category) { 
          alert("Please select a category."); 
          if (categoryEl) categoryEl.focus();
          return; 
        }
        
        // Create new post object
        const newPost = {
          id: Date.now().toString(36),
          type: type,
          title: title,
          body: body,
          category: category,
          createdAt: new Date().toISOString(),
          createdBy: "current-admin-id", // TODO: Replace with actual admin ID
          createdByName: "Admin User", // TODO: Replace with actual admin name
          imageUrl: null, // TODO: Handle image upload
          archived: false
        };
        
        // Save to localStorage (temporary - will be replaced with API)
        const list = load();
        list.push(newPost);
        save(list);
        
        // Reset form
        if (titleEl) titleEl.value = "";
        if (bodyEl) bodyEl.value = "";
        if (categoryEl) categoryEl.value = "";
        const announcementRadio = modal.querySelector("#ann-type-announcement");
        if (announcementRadio) announcementRadio.checked = true;
        
        // Close modal and refresh views
        closeModal(modal);
        render(); // Refresh dashboard preview
        renderFullSection(); // Refresh full section if present
      });
    }

    // allow clicking backdrop to close modal
    if (modal) {
      modal.addEventListener("click", (ev) => {
        if (ev.target === modal) closeModal(modal);
      });
    }


    // FULL SECTION INITIALIZATION

    // Check if we're on the announcements section page
    const annGrid = document.getElementById('ann-grid');
    if (annGrid) {
      setupTabs();
      setupFilters();
      renderFullSection();
    }

    // Handle "New Post" button in full section
    const newAnnBtn = document.getElementById('btn-new-announcement');

    if (newAnnBtn && modal) {
      newAnnBtn.addEventListener('click', () => openModal(modal));
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();