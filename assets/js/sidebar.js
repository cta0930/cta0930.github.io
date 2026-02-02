// Sidebar Toggle Functionality
(function() {
  'use strict';
  
  // Get sidebar and toggle button elements
  const sidebar = document.getElementById('sidebar');
  const toggleButton = document.getElementById('sidebar-toggle');
  
  // Check if elements exist
  if (!sidebar || !toggleButton) {
    return;
  }
  
  // Load saved state from localStorage
  const savedState = localStorage.getItem('sidebarCollapsed');
  if (savedState === 'true') {
    sidebar.classList.add('collapsed');
  }
  
  // Toggle sidebar on button click
  toggleButton.addEventListener('click', function() {
    sidebar.classList.toggle('collapsed');
    
    // Save state to localStorage
    const isCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebarCollapsed', isCollapsed);
  });
  
})();
