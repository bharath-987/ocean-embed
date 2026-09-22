/**
 * sidebar-nav.js — macOS-Style Sliding Sidebar Navigation for Kyogre
 *
 * Provides a fluid, spring-animated sliding hover pill that glides between
 * navigation items along the vertical axis, matching macOS Big Sur / Sonoma / Sequoia
 * sidebar behavior.
 */

(function () {
  'use strict';

  function initSlidingSidebar() {
    const navs = document.querySelectorAll('.ky-sidebar__nav');
    if (!navs || navs.length === 0) return;

    navs.forEach(function (nav) {
      if (nav.dataset.slidingInitialized === 'true') return;
      nav.dataset.slidingInitialized = 'true';
      nav.classList.add('has-sliding-pill');

      // Ensure sliding hover pill exists
      let pill = nav.querySelector('.ky-sidebar__slide-pill');
      if (!pill) {
        pill = document.createElement('div');
        pill.className = 'ky-sidebar__slide-pill';
        pill.setAttribute('aria-hidden', 'true');
        nav.prepend(pill);
      }

      const items = Array.from(nav.querySelectorAll('.ky-nav-item'));
      if (items.length === 0) return;

      let isVisible = false;
      let currentItem = null;

      function updatePillPosition(item, immediate) {
        if (!item || !pill) return;
        const navRect = nav.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();

        const top = itemRect.top - navRect.top;
        const left = itemRect.left - navRect.left;
        const width = itemRect.width;
        const height = itemRect.height;

        if (immediate) {
          pill.style.transition = 'none';
        } else {
          pill.style.transition = '';
        }

        pill.style.transform = 'translate3d(' + Math.round(left) + 'px, ' + Math.round(top) + 'px, 0)';
        pill.style.width = Math.round(width) + 'px';
        pill.style.height = Math.round(height) + 'px';
      }

      function showPillAt(item) {
        if (!item) return;
        currentItem = item;

        // If hovered on the active item, smoothly tuck/fade the hover pill
        if (item.classList.contains('ky-nav-item--active')) {
          pill.style.opacity = '0';
          updatePillPosition(item, false);
          return;
        }

        if (!isVisible) {
          // First entry: snap position instantly, then smoothly fade in
          updatePillPosition(item, true);
          // Force layout reflow before reenabling transition
          void pill.offsetHeight;
          pill.style.transition = '';
          pill.style.opacity = '1';
          isVisible = true;
        } else {
          // Already visible: smoothly slide to the newly hovered item
          updatePillPosition(item, false);
          pill.style.opacity = '1';
        }
      }

      function hidePill() {
        isVisible = false;
        currentItem = null;
        if (pill) {
          pill.style.opacity = '0';
        }
      }

      // Wire mouse and focus events on each nav item
      items.forEach(function (item) {
        item.addEventListener('mouseenter', function () {
          showPillAt(item);
        });

        item.addEventListener('focus', function () {
          showPillAt(item);
        });

        item.addEventListener('click', function () {
          const navId = item.getAttribute('data-nav') || '';
          try {
            sessionStorage.setItem('ky_last_nav', navId);
            sessionStorage.setItem('ky_last_nav_time', String(Date.now()));
          } catch (e) {
            // Ignore storage restrictions
          }
        });
      });

      // Mouse leave container hides the pill
      nav.addEventListener('mouseleave', function () {
        hidePill();
      });

      nav.addEventListener('focusout', function (e) {
        if (!nav.contains(e.relatedTarget)) {
          hidePill();
        }
      });

      // Window resize re-aligns pill to hovered item if visible
      window.addEventListener('resize', function () {
        if (isVisible && currentItem) {
          updatePillPosition(currentItem, true);
        }
      }, { passive: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSlidingSidebar);
  } else {
    initSlidingSidebar();
  }

  // Export for testing or manual re-initialization if needed
  if (typeof window !== 'undefined') {
    window.initSlidingSidebar = initSlidingSidebar;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initSlidingSidebar: initSlidingSidebar };
  }
})();
