
const MAX_POSTS_TO_SHOW = 3; 

/**
 * Get relative time string (e.g., "5 minutes ago", "2 hours ago")
 * @param {Date} date - The date to convert
 * @returns {string} - Relative time string
 */
function getRelativeTime(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    // Less than a minute
    if (diffInSeconds < 60) {
        return 'Just now';
    }
    
    // Less than an hour
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
    }
    
    // Less than a day
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    }
    
    // Less than a week
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
        return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    }
    
    // More than a week - show actual date
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
    });
}

/**
 * Load posts from localStorage
 * @returns {Array} - Array of all posts (announcements and news)
 */
function loadPostsFromStorage() {
    try {
        // IMPORTANT: Use the same key as admin portal!
        const STORE_KEY = "hfa_announcements"; // Must match admin-announcement.js
        
        // Get posts from localStorage (saved by admin portal)
        const postsJSON = localStorage.getItem(STORE_KEY);
        
        // If no posts exist, return empty array
        if (!postsJSON) {
            console.log('No posts found in localStorage');
            return [];
        }
        
        // Parse JSON string to JavaScript array
        const posts = JSON.parse(postsJSON);
        
        // Filter out archived posts (we only want active posts)
        const activePosts = posts.filter(post => !post.archived);
        
        console.log(`Loaded ${posts.length} total posts, ${activePosts.length} active posts`);
        
        return activePosts;
        
    } catch (error) {
        console.error('Error loading posts:', error);
        return [];
    }
}

/**
 * Filter posts by type (announcement or news)
 * @param {Array} posts - All posts
 * @param {string} type - 'announcement' or 'news'
 * @returns {Array} - Filtered posts
 */
function filterPostsByType(posts, type) {
    // Filter posts by type and sort by date (newest first)
    return posts
        .filter(post => post.type === type)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, MAX_POSTS_TO_SHOW); // Take only first 5 posts
}

// ============================================
// 3. RENDERING FUNCTIONS
// ============================================

/**
 * Create a post card element from template
 * @param {Object} post - Post data object
 * @returns {HTMLElement} - Post card element
 */
function createPostCard(post) {
    // Get the template element
    const template = document.getElementById('ann-post-template');
    
    // Clone the template content
    const postCard = template.content.cloneNode(true);
    
    // Get the main card element
    const card = postCard.querySelector('.ann-post-card');
    
    // ===== Fill in post data =====
    
    // 1. Category
    const categoryElement = postCard.querySelector('.ann-post-category');
    categoryElement.textContent = post.category || 'General';
    
    // 2. Date (relative time)
    const dateElement = postCard.querySelector('.ann-post-date');
    const postDate = new Date(post.createdAt);
    dateElement.textContent = getRelativeTime(postDate);
    
    // 3. Title
    const titleElement = postCard.querySelector('.ann-post-title');
    titleElement.textContent = post.title;
    
    // 4. Body preview
    const bodyElement = postCard.querySelector('.ann-post-body');
    bodyElement.textContent = post.body;
    
    // 5. Author
    const authorElement = postCard.querySelector('.ann-post-author');
    authorElement.textContent = `By ${post.createdByName || 'Admin'}`;
    
    // 6. Image (if exists)
    if (post.imageUrl) {
        // If post has an image, add 'has-image' class and set image source
        card.classList.add('has-image');
        const imageElement = postCard.querySelector('.ann-post-image img');
        imageElement.src = post.imageUrl;
        imageElement.alt = post.title;
    }
    
    // 7. Read More button - add click handler
    const readMoreBtn = postCard.querySelector('.ann-read-more');
    readMoreBtn.addEventListener('click', () => {
        // When clicked, show full post details
        showFullPost(post);
    });
    
    return postCard;
}

/**
 * Render posts in a specific container
 * @param {Array} posts - Array of posts to render
 * @param {string} containerId - ID of container element
 * @param {string} emptyStateId - ID of empty state element
 */
function renderPosts(posts, containerId, emptyStateId) {
    // Get container and empty state elements
    const container = document.getElementById(containerId);
    const emptyState = document.getElementById(emptyStateId);
    
    // Clear existing posts (except empty state and loading state)
    const existingCards = container.querySelectorAll('.ann-post-card');
    existingCards.forEach(card => card.remove());
    
    // Check if we have posts to display
    if (posts.length === 0) {
        // No posts - show empty state
        emptyState.style.display = 'flex';
    } else {
        // We have posts - hide empty state
        emptyState.style.display = 'none';
        
        // Create and append post cards
        posts.forEach(post => {
            const postCard = createPostCard(post);
            container.appendChild(postCard);
        });
    }
}

/**
 * Show full post in a modal or separate page
 * @param {Object} post - Post data object
 */
function showFullPost(post) {
    // TODO: In future, this will open a modal or navigate to full post page
    // For now, just show an alert with the post details
    
    alert(`
Title: ${post.title}

Category: ${post.category}

Content:
${post.body}

Posted by: ${post.createdByName || 'Admin'}
Date: ${new Date(post.createdAt).toLocaleDateString()}
    `);
    
    // Future implementation could be:
    // - Open a modal with full post details
    // - Navigate to a dedicated post page (/post/:id)
    // - Expand the card inline
}

// ============================================
// 4. MAIN INITIALIZATION FUNCTION
// ============================================

/**
 * Initialize and load announcements & news
 * This function runs when the page loads
 */
function initializeLandingAnnouncements() {
    console.log('Loading announcements and news...');
    
    // Show loading states
    const announcementsLoading = document.getElementById('announcements-loading');
    const newsLoading = document.getElementById('news-loading');
    
    if (announcementsLoading) announcementsLoading.classList.add('active');
    if (newsLoading) newsLoading.classList.add('active');
    
    // Simulate a small delay to show loading state (remove this in production)
    setTimeout(() => {
        // 1. Load all posts from localStorage
        let allPosts = loadPostsFromStorage();
        
        // TESTING: If no posts exist, create sample posts for demo
        if (allPosts.length === 0) {
            console.log('No posts found. Creating sample posts for testing...');
            allPosts = createSamplePosts();
        }
        
        console.log(`Loaded ${allPosts.length} total posts`);
        
        // 2. Separate announcements and news
        const announcements = filterPostsByType(allPosts, 'announcement');
        const news = filterPostsByType(allPosts, 'news');
        
        console.log(`Found ${announcements.length} announcements, ${news.length} news`);
        
        // 3. Render announcements
        renderPosts(announcements, 'announcements-list', 'announcements-empty');
        
        // 4. Render news
        renderPosts(news, 'news-list', 'news-empty');
        
        // Hide loading states
        if (announcementsLoading) announcementsLoading.classList.remove('active');
        if (newsLoading) newsLoading.classList.remove('active');
        
        console.log('Announcements and news loaded successfully!');
        
    }, 500); // 500ms delay to show loading animation
}

/**
 * Create sample posts for testing (TEMPORARY)
 * Remove this function once you have real posts
 */
function createSamplePosts() {
    return [
        {
            id: "demo1",
            type: "announcement",
            title: "Welcome to Holy Family Academy!",
            body: "We are excited to welcome all students and parents to the new academic year. Our commitment to quality Catholic education continues to guide everything we do.",
            category: "General",
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
            createdByName: "Admin",
            imageUrl: null,
            archived: false
        },
        {
            id: "demo2",
            type: "announcement",
            title: "Enrollment Period Extended",
            body: "Good news! The enrollment period for SY 2024-2025 has been extended until June 30, 2024. Don't miss this opportunity to secure your slot!",
            category: "Academic",
            createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
            createdByName: "Registrar",
            imageUrl: null,
            archived: false
        },
        {
            id: "demo3",
            type: "news",
            title: "STEM Students Win Regional Competition",
            body: "Congratulations to our Grade 11 STEM students for winning first place at the Regional Science Fair! The team presented an innovative project on renewable energy solutions.",
            category: "Sports",
            createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
            createdByName: "Principal",
            imageUrl: null,
            archived: false
        },
        {
            id: "demo4",
            type: "news",
            title: "New Library Opens Next Week",
            body: "Our newly renovated library will open its doors next Monday! Students will have access to thousands of new books and digital resources.",
            category: "Event",
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
            createdByName: "Librarian",
            imageUrl: null,
            archived: false
        }
    ];
}

// ============================================
// 5. AUTO-RUN WHEN PAGE LOADS
// ============================================

// Wait for DOM to be fully loaded before running
if (document.readyState === 'loading') {
    // DOM is still loading, wait for it
    document.addEventListener('DOMContentLoaded', initializeLandingAnnouncements);
} else {
    // DOM is already loaded, run immediately
    initializeLandingAnnouncements();
}

// ============================================
// 6. OPTIONAL: AUTO-REFRESH FUNCTIONALITY
// ============================================

/**
 * Refresh posts every 30 seconds to get latest data
 * This ensures the page stays up-to-date without manual refresh
 */
function enableAutoRefresh() {
    setInterval(() => {
        console.log('Auto-refreshing posts...');
        initializeLandingAnnouncements();
    }, 30000); // Refresh every 30 seconds
}

// Enable auto-refresh (optional - comment out if not needed)
// enableAutoRefresh();
