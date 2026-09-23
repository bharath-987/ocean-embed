/**
 * datepicker.js — Watermelon UI DatePicker 3 Custom Calendar for Kyogre
 *
 * Provides a floating calendar popover that reveals with a smooth sliding
 * animation, circular day buttons, month navigation, and model date bounds
 * (2023-01-01 to 2023-12-31).
 */

(function () {
  'use strict';

  const MIN_DATE = new Date('2023-01-01T00:00:00');
  const MAX_DATE = new Date('2023-12-31T23:59:59');
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatISO(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function initDatePicker() {
    const wraps = document.querySelectorAll('.ky-date-picker-wrap');
    if (!wraps || wraps.length === 0) return;

    wraps.forEach(function (wrap) {
      if (wrap.dataset.datePickerInitialized === 'true') return;
      wrap.dataset.datePickerInitialized = 'true';

      const dateBtn = wrap.querySelector('#ky-date-btn');
      const nativeInput = wrap.querySelector('#native-date-picker');
      const displayHeader = wrap.querySelector('#date-display-header');

      // Check for existing selection
      let selectedDateStr = (nativeInput && nativeInput.value) || '';
      if (!selectedDateStr && displayHeader && /^\d{4}-\d{2}-\d{2}$/.test(displayHeader.textContent.trim())) {
        selectedDateStr = displayHeader.textContent.trim();
      }

      // Default viewing month: October 2023 or selected date's month
      let viewDate = selectedDateStr ? new Date(selectedDateStr + 'T00:00:00') : new Date('2023-10-22T00:00:00');
      if (isNaN(viewDate.getTime()) || viewDate < MIN_DATE || viewDate > MAX_DATE) {
        viewDate = new Date('2023-10-01T00:00:00');
      }

      // Create calendar popover container
      const popover = document.createElement('div');
      popover.className = 'ky-calendar-popover';
      popover.setAttribute('role', 'dialog');
      popover.setAttribute('aria-label', 'Choose date');
      wrap.appendChild(popover);

      let isOpen = false;

      function renderCalendar() {
        popover.innerHTML = '';

        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();

        // 1. Header (Prev button, Month Year title, Next button)
        const header = document.createElement('div');
        header.className = 'ky-cal-header';

        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'ky-cal-nav-btn ky-cal-prev';
        prevBtn.setAttribute('aria-label', 'Previous month');
        prevBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

        // Disable prev if prior month is before model start
        const prevMonthDate = new Date(year, month - 1, 1);
        if (new Date(year, month, 0) < MIN_DATE) {
          prevBtn.disabled = true;
        }
        prevBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          viewDate = new Date(year, month - 1, 1);
          renderCalendar();
        });

        const title = document.createElement('div');
        title.className = 'ky-cal-title';
        title.textContent = MONTH_NAMES[month] + ' ' + year;

        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'ky-cal-nav-btn ky-cal-next';
        nextBtn.setAttribute('aria-label', 'Next month');
        nextBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

        // Disable next if next month is after model end
        if (new Date(year, month + 1, 1) > MAX_DATE) {
          nextBtn.disabled = true;
        }
        nextBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          viewDate = new Date(year, month + 1, 1);
          renderCalendar();
        });

        header.appendChild(prevBtn);
        header.appendChild(title);
        header.appendChild(nextBtn);
        popover.appendChild(header);

        // 2. Weekdays row
        const weekdaysRow = document.createElement('div');
        weekdaysRow.className = 'ky-cal-weekdays';
        WEEKDAYS.forEach(function (wd) {
          const el = document.createElement('div');
          el.className = 'ky-cal-weekday';
          el.textContent = wd;
          weekdaysRow.appendChild(el);
        });
        popover.appendChild(weekdaysRow);

        // 3. Days grid
        const daysGrid = document.createElement('div');
        daysGrid.className = 'ky-cal-days';

        const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sunday
        const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthLastDay = new Date(year, month, 0).getDate();

        // Leading days from previous month
        for (let i = firstDayIndex - 1; i >= 0; i--) {
          const dayNum = prevMonthLastDay - i;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ky-cal-day is-outside';
          btn.textContent = String(dayNum);
          btn.disabled = true;
          daysGrid.appendChild(btn);
        }

        // Current month days
        const todayStr = formatISO(new Date());
        for (let day = 1; day <= totalDaysInMonth; day++) {
          const cellDate = new Date(year, month, day);
          const cellISO = formatISO(cellDate);

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ky-cal-day';
          btn.textContent = String(day);
          btn.setAttribute('data-date', cellISO);

          if (cellDate < MIN_DATE || cellDate > MAX_DATE) {
            btn.disabled = true;
          } else {
            if (cellISO === selectedDateStr) {
              btn.classList.add('is-selected');
            }
            if (cellISO === todayStr) {
              btn.classList.add('is-today');
            }

            btn.addEventListener('click', function (e) {
              e.stopPropagation();
              selectDate(cellISO);
            });
          }

          daysGrid.appendChild(btn);
        }

        // Trailing days from next month to make clean 7-column rows
        const currentCount = firstDayIndex + totalDaysInMonth;
        const remaining = (7 - (currentCount % 7)) % 7;
        for (let j = 1; j <= remaining; j++) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ky-cal-day is-outside';
          btn.textContent = String(j);
          btn.disabled = true;
          daysGrid.appendChild(btn);
        }

        popover.appendChild(daysGrid);
      }

      function selectDate(isoDate) {
        selectedDateStr = isoDate;

        // Update display text
        if (displayHeader) {
          displayHeader.textContent = isoDate;
        }

        // Update native date picker and fire change event for app.js / listeners
        if (nativeInput) {
          nativeInput.value = isoDate;
          const evt = new Event('change', { bubbles: true });
          nativeInput.dispatchEvent(evt);
        }

        closeCalendar();
      }

      function openCalendar() {
        if (isOpen) return;
        isOpen = true;
        renderCalendar();
        popover.classList.add('is-open');
        if (dateBtn) {
          dateBtn.classList.add('is-active');
        }
      }

      function closeCalendar() {
        if (!isOpen) return;
        isOpen = false;
        popover.classList.remove('is-open');
        if (dateBtn) {
          dateBtn.classList.remove('is-active');
        }
      }

      function toggleCalendar(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (isOpen) {
          closeCalendar();
        } else {
          openCalendar();
        }
      }

      if (dateBtn) {
        dateBtn.addEventListener('click', toggleCalendar);
      }

      // Dismiss on click outside
      document.addEventListener('click', function (e) {
        if (isOpen && !wrap.contains(e.target)) {
          closeCalendar();
        }
      });

      // Dismiss on escape key
      document.addEventListener('keydown', function (e) {
        if (isOpen && e.key === 'Escape') {
          closeCalendar();
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDatePicker);
  } else {
    initDatePicker();
  }

  if (typeof window !== 'undefined') {
    window.initDatePicker = initDatePicker;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initDatePicker: initDatePicker };
  }
})();
