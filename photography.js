/**
 * Photography page viewer.
 * Opens photos in a full-view modal and applies light deterrents (no right-click,
 * no drag) to the images themselves.
 */

document.addEventListener('DOMContentLoaded', () => {
  const photoCards = document.querySelectorAll('.photo-card');
  const photoModal = document.getElementById('photoModal');
  const modalImage = document.getElementById('modalImage');
  const modalClose = document.getElementById('modalClose');
  const modalContent = photoModal.querySelector('.photo-modal-content');

  // Element that had focus before the modal opened, so we can restore it on close.
  let lastFocused = null;

  const openModal = (card) => {
    const img = card.querySelector('img');
    if (!img) return;

    modalImage.src = img.currentSrc || img.src;
    modalImage.alt = img.alt;
    lastFocused = card;
    photoModal.classList.add('active');
    photoModal.removeAttribute('aria-hidden');
    document.body.style.overflow = 'hidden'; // Disable background scrolling
    modalClose.focus();
  };

  const closeModal = () => {
    photoModal.classList.remove('active');
    photoModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = ''; // Re-enable background scrolling

    if (lastFocused) {
      lastFocused.focus();
      lastFocused = null;
    }

    // Clear image after the transition so the next open doesn't flicker.
    setTimeout(() => {
      if (photoModal.classList.contains('active')) return;
      modalImage.removeAttribute('src');
      modalImage.alt = '';
      modalContent.style.transform = '';
      modalContent.style.transition = '';
    }, 300);
  };

  photoCards.forEach(card => {
    card.addEventListener('click', () => openModal(card));

    // Cards are <button>s, so Enter/Space already activate them. Nothing extra needed.
  });

  modalClose.addEventListener('click', closeModal);

  // Close on backdrop click, including the transparent overlay above the image.
  photoModal.addEventListener('click', (e) => {
    if (e.target === photoModal || e.target.classList.contains('photo-modal-overlay')) {
      closeModal();
    }
  });

  // Escape closes; Tab is trapped inside the modal while it is open.
  photoModal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
    } else if (e.key === 'Tab') {
      // The close button is the only focusable control in the modal.
      e.preventDefault();
      modalClose.focus();
    }
  });

  // --- MOBILE SWIPE-TO-CLOSE GESTURE ---
  let touchStartY = 0;
  let touchMoveY = 0;
  let tracking = false;

  photoModal.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStartY = e.touches[0].clientY;
      touchMoveY = touchStartY;
      tracking = true;
      modalContent.style.transition = 'none'; // Disable transition during drag
    }
  }, { passive: true });

  photoModal.addEventListener('touchmove', (e) => {
    if (!tracking || e.touches.length !== 1) return;

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
  }, { passive: true });

  const endTouch = () => {
    if (!tracking) return;
    const deltaY = touchMoveY - touchStartY;
    tracking = false;

    if (deltaY > 120) {
      // Swiped down far enough to trigger close
      closeModal();
    } else {
      // Bounce back to original position
      modalContent.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
      modalContent.style.transform = 'translateY(0) scale(1)';
    }

    touchStartY = 0;
    touchMoveY = 0;
  };

  photoModal.addEventListener('touchend', endTouch);
  photoModal.addEventListener('touchcancel', endTouch);

  // --- LIGHT DETERRENTS ---
  // Scoped to the photos only. These raise the effort of a casual save; they are not
  // real protection, since the image files are directly fetchable by URL.

  // Block the context menu over the gallery and the modal, but leave the rest of the
  // page (links, text, headings) behaving normally.
  document.querySelectorAll('.photo-grid, .photo-modal').forEach(el => {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // Block dragging images out of the page.
  document.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG') e.preventDefault();
  });
});
