/* =============================================
   Expense & Budget Visualizer — script.js
   Vanilla JS | LocalStorage | Chart.js
   ============================================= */

// ── DOM References ──────────────────────────────────────────────────────────
const form            = document.getElementById('transactionForm');
const itemNameInput   = document.getElementById('itemName');
const amountInput     = document.getElementById('amount');
const categorySelect  = document.getElementById('category');
const totalBalanceEl  = document.getElementById('totalBalance');
const transactionList = document.getElementById('transactionList');
const emptyState      = document.getElementById('emptyState');
const sortSelect      = document.getElementById('sortSelect');
const spendingLimitInput = document.getElementById('spendingLimit');
const themeToggle     = document.getElementById('themeToggle');

// Error message elements
const nameError     = document.getElementById('nameError');
const amountError   = document.getElementById('amountError');
const categoryError = document.getElementById('categoryError');

// ── State ────────────────────────────────────────────────────────────────────
let transactions = [];   // Array of transaction objects
let chartInstance = null; // Chart.js instance (singleton)

// Category emoji map for display
const CATEGORY_EMOJI = { Food: '🍔', Transport: '🚌', Fun: '🎉' };

// Chart colors per category
const CHART_COLORS = {
  Food:      '#f59e0b',
  Transport: '#3b82f6',
  Fun:       '#a855f7',
};

// ── LocalStorage Helpers ─────────────────────────────────────────────────────

/** Load transactions array from LocalStorage */
function loadTransactions() {
  const stored = localStorage.getItem('transactions');
  return stored ? JSON.parse(stored) : [];
}

/** Persist transactions array to LocalStorage */
function saveTransactions() {
  localStorage.setItem('transactions', JSON.stringify(transactions));
}

/** Load saved theme preference */
function loadTheme() {
  return localStorage.getItem('theme') || 'light';
}

/** Load saved spending limit */
function loadSpendingLimit() {
  return localStorage.getItem('spendingLimit') || '';
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate the add-transaction form.
 * Returns true if all fields are valid, false otherwise.
 */
function validateForm() {
  let valid = true;

  // Reset previous errors
  [itemNameInput, amountInput, categorySelect].forEach(el => el.classList.remove('invalid'));
  nameError.textContent = '';
  amountError.textContent = '';
  categoryError.textContent = '';

  if (!itemNameInput.value.trim()) {
    nameError.textContent = 'Item name is required.';
    itemNameInput.classList.add('invalid');
    valid = false;
  }

  const amt = parseFloat(amountInput.value);
  if (!amountInput.value || isNaN(amt) || amt <= 0) {
    amountError.textContent = 'Enter a valid amount greater than 0.';
    amountInput.classList.add('invalid');
    valid = false;
  }

  if (!categorySelect.value) {
    categoryError.textContent = 'Please select a category.';
    categorySelect.classList.add('invalid');
    valid = false;
  }

  return valid;
}

// ── Core CRUD ────────────────────────────────────────────────────────────────

/**
 * Add a new transaction to the list and persist it.
 * @param {string} name
 * @param {number} amount
 * @param {string} category
 */
function addTransaction(name, amount, category) {
  const transaction = {
    id: Date.now(),          // unique ID based on timestamp
    name: name.trim(),
    amount: parseFloat(amount),
    category,
    date: new Date().toISOString(),
  };
  transactions.push(transaction);
  saveTransactions();
  render();
}

/**
 * Delete a transaction by its ID.
 * @param {number} id
 */
function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  saveTransactions();
  render();
}

// ── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Return a sorted copy of transactions based on the current sort selection.
 * @returns {Array}
 */
function getSortedTransactions() {
  const sortValue = sortSelect.value;
  const copy = [...transactions];

  switch (sortValue) {
    case 'date-asc':
      return copy.sort((a, b) => new Date(a.date) - new Date(b.date));
    case 'date-desc':
      return copy.sort((a, b) => new Date(b.date) - new Date(a.date));
    case 'amount-desc':
      return copy.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':
      return copy.sort((a, b) => a.amount - b.amount);
    case 'category':
      return copy.sort((a, b) => a.category.localeCompare(b.category));
    default:
      return copy;
  }
}

// ── Spending Limit ───────────────────────────────────────────────────────────

/**
 * Get the current spending limit value (or 0 if not set).
 * @returns {number}
 */
function getSpendingLimit() {
  const val = parseFloat(spendingLimitInput.value);
  return isNaN(val) || val <= 0 ? 0 : val;
}

// ── Render Functions ─────────────────────────────────────────────────────────

/**
 * Update the total balance display.
 */
function renderBalance() {
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  totalBalanceEl.textContent = formatCurrency(total);
}

/**
 * Render the transaction list to the DOM.
 */
function renderList() {
  const sorted = getSortedTransactions();
  const limit  = getSpendingLimit();

  // Clear existing items (keep emptyState node)
  transactionList.innerHTML = '';

  if (sorted.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.id = 'emptyState';
    li.textContent = 'No transactions yet. Add one above!';
    transactionList.appendChild(li);
    return;
  }

  sorted.forEach(t => {
    const isOverLimit = limit > 0 && t.amount > limit;
    const emoji = CATEGORY_EMOJI[t.category] || '💸';
    const dateStr = new Date(t.date).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric',
    });

    const li = document.createElement('li');
    li.className = `transaction-item${isOverLimit ? ' over-limit' : ''}`;
    li.setAttribute('data-id', t.id);

    li.innerHTML = `
      <div class="item-info">
        <span class="item-name">${escapeHtml(t.name)}</span>
        <span class="item-meta">${emoji} ${t.category} · ${dateStr}</span>
      </div>
      <span class="item-amount">-${formatCurrency(t.amount)}</span>
      <button class="btn-delete" aria-label="Delete ${escapeHtml(t.name)}">✕</button>
    `;

    // Attach delete handler
    li.querySelector('.btn-delete').addEventListener('click', () => {
      deleteTransaction(t.id);
    });

    transactionList.appendChild(li);
  });
}

/**
 * Render or update the Chart.js pie chart.
 */
function renderChart() {
  // Aggregate amounts by category
  const totals = {};
  transactions.forEach(t => {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  });

  const labels     = Object.keys(totals);
  const data       = Object.values(totals);
  const colors     = labels.map(l => CHART_COLORS[l] || '#6b7280');

  const ctx = document.getElementById('spendingChart').getContext('2d');

  if (chartInstance) {
    // Update existing chart data instead of recreating
    chartInstance.data.labels           = labels;
    chartInstance.data.datasets[0].data = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.update();
    return;
  }

  // Create chart for the first time
  chartInstance = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: 'var(--bg-card)',
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: getComputedStyle(document.documentElement)
              .getPropertyValue('--text-primary').trim() || '#1e1e2e',
            padding: 16,
            font: { size: 13 },
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${formatCurrency(ctx.parsed)}`,
          },
        },
      },
    },
  });
}

/**
 * Master render — call this after any state change.
 */
function render() {
  renderBalance();
  renderList();
  renderChart();
}

// ── Theme Toggle ─────────────────────────────────────────────────────────────

/**
 * Apply a theme ('light' or 'dark') to the document and update the toggle button.
 * @param {string} theme
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', theme);

  // Update chart legend color if chart exists
  if (chartInstance) {
    const textColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--text-primary').trim();
    chartInstance.options.plugins.legend.labels.color = textColor;
    chartInstance.update();
  }
}

// ── Utility Helpers ──────────────────────────────────────────────────────────

/**
 * Format a number as USD currency string.
 * @param {number} value
 * @returns {string}
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
  }).format(value);
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Event Listeners ──────────────────────────────────────────────────────────

// Form submit — add transaction
form.addEventListener('submit', e => {
  e.preventDefault();
  if (!validateForm()) return;

  addTransaction(itemNameInput.value, amountInput.value, categorySelect.value);

  // Reset form fields
  form.reset();
  [itemNameInput, amountInput, categorySelect].forEach(el => el.classList.remove('invalid'));
});

// Sort change — re-render list only
sortSelect.addEventListener('change', renderList);

// Spending limit change — re-render list to update highlights + persist
spendingLimitInput.addEventListener('input', () => {
  localStorage.setItem('spendingLimit', spendingLimitInput.value);
  renderList();
});

// Theme toggle
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ── Initialisation ───────────────────────────────────────────────────────────

/** Bootstrap the app on page load */
function init() {
  transactions = loadTransactions();
  applyTheme(loadTheme());

  // Restore spending limit input
  const savedLimit = loadSpendingLimit();
  if (savedLimit) spendingLimitInput.value = savedLimit;

  render();
}

init();
