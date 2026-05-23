/**
 * Photography Page Viewer and Anti-Theft Protection script
 * Handles opening images in high resolution and blocks standard downloading/copying techniques.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Modal Elements
  const photoCards = document.querySelectorAll('.photo-card');
  const photoModal = document.getElementById('photoModal');
  const modalImage = document.getElementById('modalImage');
  const modalClose = document.getElementById('modalClose');

  // Open Modal Handler
  photoCards.forEach(card => {
    card.addEventListener('click', () => {
      const img = card.querySelector('img');
      if (img) {
        // Set image source and alt text
        modalImage.src = img.src;
        modalImage.alt = img.alt;
        photoModal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Disable background scrolling
      }
    });
  });

  // Close Modal Handler
  const closeModal = () => {
    photoModal.classList.remove('active');
    document.body.style.overflow = ''; // Re-enable background scrolling
    const modalContent = photoModal.querySelector('.photo-modal-content');
    // Clear image src after transition to avoid flicker on next open
    setTimeout(() => {
      modalImage.src = '';
      modalImage.alt = '';
      modalContent.style.transform = '';
      modalContent.style.transition = '';
    }, 300);
  };

  modalClose.addEventListener('click', closeModal);

  // Close modal on background click
  photoModal.addEventListener('click', (e) => {
    // If clicked the backdrop or the transparent protection overlay, close the modal
    if (e.target === photoModal || e.target.classList.contains('photo-modal-overlay')) {
      closeModal();
    }
  });

  // Close modal on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && photoModal.classList.contains('active')) {
      closeModal();
    }
  });

  // --- MOBILE SWIPE-TO-CLOSE GESTURE ---
  let touchStartY = 0;
  let touchMoveY = 0;
  const modalContent = photoModal.querySelector('.photo-modal-content');

  photoModal.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStartY = e.touches[0].clientY;
      touchMoveY = touchStartY;
      modalContent.style.transition = 'none'; // Disable transition during drag
    }
  }, { passive: true });

  photoModal.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      touchMoveY = e.touches[0].clientY;
      const deltaY = touchMoveY - touchStartY;
      
      if (deltaY > 0) {
        // Dragging downwards: translate down and scale down slightly for elastic effect
        const scale = Math.max(0.88, 1 - (deltaY / 1200));
        modalContent.style.transform = `translateY(${deltaY}px) scale(${scale})`;
      } else {
        // Dragging upwards: restrict the translation to create resistance
        const resistanceY = deltaY * 0.2;
        modalContent.style.transform = `translateY(${resistanceY}px)`;
      }
    }
  }, { passive: true });

  photoModal.addEventListener('touchend', () => {
    const deltaY = touchMoveY - touchStartY;
    
    if (deltaY > 120) {
      // Swiped down far enough to trigger close
      closeModal();
    } else {
      // Bounce back to original position
      modalContent.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
      modalContent.style.transform = 'translateY(0) scale(1)';
    }
    
    // Reset touch variables
    touchStartY = 0;
    touchMoveY = 0;
  });

  // --- ANTI-THEFT PROTECTIONS ---

  // 1. Block Context Menu (Right-Click)
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  });

  // 2. Block Image Drag and Drop
  document.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG') {
      e.preventDefault();
      return false;
    }
  });

  // 3. Block Text Selection and Copy Operations
  document.addEventListener('copy', (e) => {
    e.preventDefault();
    return false;
  });
  document.addEventListener('selectstart', (e) => {
    e.preventDefault();
    return false;
  });

  // 4. Block Keyboard Shortcuts (Save, Print, Copy, DevTools)
  window.addEventListener('keydown', (e) => {
    // Save Page (Ctrl+S or Cmd+S)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      return false;
    }

    // Print Page (Ctrl+P or Cmd+P)
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      return false;
    }

    // Copy Content (Ctrl+C or Cmd+C)
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      return false;
    }

    // Developer Tools (F12)
    if (e.key === 'F12') {
      e.preventDefault();
      return false;
    }

    // Inspect/DevTools (Ctrl+Shift+I / Cmd+Opt+I)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
      e.preventDefault();
      return false;
    }

    // Inspect Element (Ctrl+Shift+C)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      return false;
    }
  });

  // 5. Blur Page on Focus Loss (Deters Screenshotting & Snipping Tool)
  const blurPage = () => {
    document.body.classList.add('blurred');
  };

  const unblurPage = () => {
    if (document.hasFocus()) {
      document.body.classList.remove('blurred');
    }
  };

  window.addEventListener('blur', blurPage);
  window.addEventListener('focus', unblurPage);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      blurPage();
    } else {
      unblurPage();
    }
  });

  // 6. Pre-empt OS Screenshot Utilities (e.g., Win+Shift+S / Cmd+Shift+4)
  // By capturing keydown of modifier/screenshot keys, we blur and hide the images
  // *before* the OS freezes/grabs the browser frame.
  const screenshotKeys = ['PrintScreen', 'Meta', 'Shift', 'Control', 'Alt'];

  window.addEventListener('keydown', (e) => {
    if (screenshotKeys.includes(e.key) || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
      blurPage();
    }
  });

  window.addEventListener('keyup', (e) => {
    // If no modifier keys are held, and window is focused, we can unblur
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      unblurPage();
    }
  });

  // 7. Blur on Mouse Leave (Deters moving the cursor out of the window to click snipping tool)
  document.addEventListener('mouseleave', blurPage);
  document.addEventListener('mouseenter', unblurPage);
});
