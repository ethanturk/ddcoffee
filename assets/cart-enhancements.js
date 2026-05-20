/**
 * Drifting Drams — Cart Drawer Enhancements
 *
 * Three independent web components that hook into Dawn's cart drawer
 * without modifying its HTML structure. They:
 *   - listen for cart updates (Dawn fires its own events; we also patch
 *     fetch for /cart/* endpoints as a fallback)
 *   - find their target slots in the drawer
 *   - render themselves into those slots
 *
 * Why this approach: Dawn's snippets/cart-drawer.liquid is 580+ lines
 * and gets upstream changes regularly. Editing it would mean constant
 * merge pain. Hooking in via JS keeps the Dawn file untouched.
 */

(function () {
  'use strict';

  // ---------- Config from <cart-enhancements> data attributes ----------

  function readConfig() {
    const el = document.querySelector('cart-enhancements');
    if (!el) return null;
    return {
      shippingEnabled: el.dataset.shippingEnabled === 'true',
      shippingThreshold: parseFloat(el.dataset.shippingThreshold) || 0,
      upsellEnabled: el.dataset.upsellEnabled === 'true',
      upsellCollection: el.dataset.upsellCollection || '',
      shipEstimateEnabled: el.dataset.shipEstimateEnabled === 'true',
      fulfillmentDays: parseInt(el.dataset.fulfillmentDays, 10) || 0,
      transitMinDays: parseInt(el.dataset.transitMinDays, 10) || 1,
      transitMaxDays: parseInt(el.dataset.transitMaxDays, 10) || 1,
    };
  }

  // ---------- Cart state — single source of truth ----------

  class CartState extends EventTarget {
    constructor() {
      super();
      this.data = null;
      this.fetching = null;
    }

    async refresh() {
      // Coalesce concurrent refresh calls
      if (this.fetching) return this.fetching;
      this.fetching = fetch('/cart.js', { headers: { Accept: 'application/json' } })
        .then((r) => r.json())
        .then((data) => {
          this.data = data;
          this.dispatchEvent(new CustomEvent('change', { detail: data }));
          return data;
        })
        .catch((err) => {
          console.error('[cart-enhancements] cart refresh failed:', err);
        })
        .finally(() => {
          this.fetching = null;
        });
      return this.fetching;
    }
  }

  const cartState = new CartState();

  // Patch fetch so any cart mutation triggers a refresh
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (/\/cart\/(add|change|update|clear)/.test(url)) {
      // Defer slightly so Dawn's own handlers run first
      setTimeout(() => cartState.refresh(), 0);
    }
    return response;
  };

  // Also refresh when the drawer opens, in case Dawn updated state outside our hook
  document.addEventListener('click', (e) => {
    if (e.target.closest('#cart-icon-bubble, [aria-controls="CartDrawer"]')) {
      cartState.refresh();
    }
  });

  // Initial load
  document.addEventListener('DOMContentLoaded', () => cartState.refresh());

  // ---------- Free shipping progress bar ----------

  class CartShippingBar extends HTMLElement {
    constructor() {
      super();
      this.config = readConfig();
    }

    connectedCallback() {
      if (!this.config?.shippingEnabled) return;
      cartState.addEventListener('change', this.render);
      if (cartState.data) this.render({ detail: cartState.data });
    }

    disconnectedCallback() {
      cartState.removeEventListener('change', this.render);
    }

    render = (e) => {
      const cart = e.detail;
      if (!cart) return;

      const threshold = this.config.shippingThreshold * 100; // cart prices in cents
      const total = cart.total_price;
      const remaining = Math.max(0, threshold - total);
      const pct = Math.min(100, (total / threshold) * 100);
      const qualified = remaining === 0;

      const formattedRemaining = this.formatMoney(remaining);

      this.innerHTML = `
        <div class="cart-shipping-bar ${qualified ? 'is-qualified' : ''}">
          <p class="cart-shipping-bar__message">
            ${
              qualified
                ? `<strong>You've unlocked free shipping.</strong>`
                : `You're <strong>${formattedRemaining}</strong> away from free shipping.`
            }
          </p>
          <div class="cart-shipping-bar__track" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100">
            <div class="cart-shipping-bar__fill" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    };

    formatMoney(cents) {
      // Use the global Shopify money formatter if available, else fall back
      if (window.Shopify && window.Shopify.formatMoney) {
        return window.Shopify.formatMoney(cents, window.Shopify.money_format);
      }
      return `$${(cents / 100).toFixed(2)}`;
    }
  }
  customElements.define('cart-shipping-bar', CartShippingBar);

  // ---------- Cross-sell / pairs well with ----------

  class CartUpsell extends HTMLElement {
    constructor() {
      super();
      this.config = readConfig();
      this.lastSignature = null;
    }

    connectedCallback() {
      if (!this.config?.upsellEnabled) return;
      cartState.addEventListener('change', this.maybeRender);
      if (cartState.data) this.maybeRender({ detail: cartState.data });
    }

    disconnectedCallback() {
      cartState.removeEventListener('change', this.maybeRender);
    }

    /**
     * Only re-fetch recommendations when the set of products in the cart actually
     * changes — not on quantity tweaks. Avoids hammering /recommendations.
     */
    maybeRender = (e) => {
      const cart = e.detail;
      if (!cart || !cart.items?.length) {
        this.innerHTML = '';
        this.lastSignature = null;
        return;
      }
      const signature = cart.items.map((i) => i.product_id).sort().join(',');
      if (signature === this.lastSignature) return;
      this.lastSignature = signature;
      this.fetchAndRender(cart);
    };

    async fetchAndRender(cart) {
      const cartProductIds = new Set(cart.items.map((i) => i.product_id));
      const seedId = cart.items[0].product_id;

      let recommendations = [];

      try {
        const res = await fetch(
          `/recommendations/products.json?product_id=${seedId}&limit=4&intent=related`,
          { headers: { Accept: 'application/json' } }
        );
        if (res.ok) {
          const data = await res.json();
          recommendations = (data.products || []).filter((p) => !cartProductIds.has(p.id));
        }
      } catch (err) {
        console.warn('[cart-enhancements] recommendations fetch failed:', err);
      }

      // Fallback to configured collection
      if (recommendations.length === 0 && this.config.upsellCollection) {
        try {
          const res = await fetch(
            `/collections/${this.config.upsellCollection}/products.json?limit=4`,
            { headers: { Accept: 'application/json' } }
          );
          if (res.ok) {
            const data = await res.json();
            recommendations = (data.products || []).filter((p) => !cartProductIds.has(p.id));
          }
        } catch (err) {
          console.warn('[cart-enhancements] fallback collection fetch failed:', err);
        }
      }

      const items = recommendations.slice(0, 2);
      if (items.length === 0) {
        this.innerHTML = '';
        return;
      }

      this.innerHTML = `
        <div class="cart-upsell">
          <h3 class="cart-upsell__heading">Pairs well with</h3>
          <ul class="cart-upsell__list" role="list">
            ${items.map((p) => this.renderItem(p)).join('')}
          </ul>
        </div>
      `;

      this.querySelectorAll('[data-add-upsell]').forEach((btn) => {
        btn.addEventListener('click', this.onAdd);
      });
    }

    renderItem(product) {
      const variant = product.variants?.[0];
      if (!variant) return '';

      // /products.json returns full URLs for images in some responses, handles in others
      const img =
        product.featured_image ||
        product.images?.[0] ||
        (product.media && product.media[0]?.src) ||
        '';
      const imgUrl = typeof img === 'string' ? img : img?.src || '';

      return `
        <li class="cart-upsell__item">
          <a href="/products/${product.handle}" class="cart-upsell__image-link" aria-label="${this.escape(product.title)}">
            ${imgUrl ? `<img src="${imgUrl}" alt="" width="56" height="56" loading="lazy">` : ''}
          </a>
          <div class="cart-upsell__details">
            <a href="/products/${product.handle}" class="cart-upsell__title">${this.escape(product.title)}</a>
            <p class="cart-upsell__price">${this.formatMoney(variant.price)}</p>
          </div>
          <button
            type="button"
            class="cart-upsell__add"
            data-add-upsell
            data-variant-id="${variant.id}"
            aria-label="Add ${this.escape(product.title)} to cart"
          >
            Add
          </button>
        </li>
      `;
    }

    onAdd = async (evt) => {
      const button = evt.currentTarget;
      const variantId = button.dataset.variantId;
      if (!variantId) return;

      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = '…';

      try {
        const formData = new FormData();
        formData.append('id', variantId);
        formData.append('quantity', 1);

        // Ask for the same sections Dawn refreshes so the drawer updates inline
        const sections = [];
        if (document.getElementById('cart-drawer')) sections.push('cart-drawer');
        if (document.getElementById('cart-icon-bubble')) sections.push('cart-icon-bubble');
        if (sections.length) formData.append('sections', sections.join(','));
        formData.append('sections_url', window.location.pathname);

        const res = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { Accept: 'application/javascript', 'X-Requested-With': 'XMLHttpRequest' },
          body: formData,
        });

        if (!res.ok) throw new Error(`Add failed: ${res.status}`);
        const data = await res.json();

        // Update Dawn's cart-drawer with returned sections HTML
        if (data.sections) {
          Object.entries(data.sections).forEach(([id, html]) => {
            const target = document.getElementById(id);
            if (!target) return;
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const replacement = doc.querySelector(`#${id}`) || doc.querySelector('.shopify-section');
            if (replacement) target.innerHTML = replacement.innerHTML;
          });
        }

        cartState.refresh();
      } catch (err) {
        console.error('[cart-enhancements] upsell add failed:', err);
        button.textContent = originalText;
        button.disabled = false;
      }
    };

    formatMoney(cents) {
      if (window.Shopify && window.Shopify.formatMoney) {
        return window.Shopify.formatMoney(cents, window.Shopify.money_format);
      }
      return `$${(cents / 100).toFixed(2)}`;
    }

    escape(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  }
  customElements.define('cart-upsell', CartUpsell);

  // ---------- Estimated delivery ----------

  /**
   * Mirrors Shopify's Manual Estimated Delivery Dates:
   *   fulfillment time (business days from order to ship)
   *   + transit time min..max (business days from ship to delivery)
   *
   * Keep the values in sync with Settings → Shipping and delivery →
   * Estimated delivery dates. The same computation Shopify performs
   * is reproduced here so the cart shows the same range as checkout.
   */
  class CartShipEstimate extends HTMLElement {
    constructor() {
      super();
      this.config = readConfig();
    }

    connectedCallback() {
      if (!this.config?.shipEstimateEnabled) return;
      cartState.addEventListener('change', this.render);
      this.render();
    }

    disconnectedCallback() {
      cartState.removeEventListener('change', this.render);
    }

    render = () => {
      const { fulfillmentDays, transitMinDays, transitMaxDays } = this.config;
      const today = new Date();

      // Ship date = today + fulfillmentDays business days
      const shipDate = this.addBusinessDays(today, fulfillmentDays);

      // Delivery range = ship date + transit min..max business days
      const minDeliveryDate = this.addBusinessDays(shipDate, transitMinDays);
      const maxDeliveryDate = this.addBusinessDays(shipDate, transitMaxDays);

      const sameDate =
        minDeliveryDate.toDateString() === maxDeliveryDate.toDateString();
      const sameMonth = minDeliveryDate.getMonth() === maxDeliveryDate.getMonth();

      const monthDay = new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
      });
      const dayOnly = new Intl.DateTimeFormat(undefined, { day: 'numeric' });

      let rangeText;
      if (sameDate) {
        rangeText = monthDay.format(minDeliveryDate);
      } else if (sameMonth) {
        // "Mar 18–21"
        rangeText = `${monthDay.format(minDeliveryDate)}–${dayOnly.format(maxDeliveryDate)}`;
      } else {
        // "Mar 28–Apr 2"
        rangeText = `${monthDay.format(minDeliveryDate)}–${monthDay.format(maxDeliveryDate)}`;
      }

      this.innerHTML = `
        <div class="cart-ship-estimate">
          <svg class="cart-ship-estimate__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M3 7h13v10H3z" stroke-linejoin="round"/>
            <path d="M16 10h4l1 3v4h-5" stroke-linejoin="round"/>
            <circle cx="7" cy="18" r="2"/>
            <circle cx="18" cy="18" r="2"/>
          </svg>
          <div class="cart-ship-estimate__text">
            <p class="cart-ship-estimate__line">
              Estimated delivery <strong>${rangeText}</strong>
            </p>
          </div>
        </div>
      `;
    };

    /**
     * Add N business days to a date (skipping Sat/Sun).
     * If the starting date itself falls on a weekend, advance to the
     * next business day before counting — otherwise N=0 on a Sunday
     * would return Sunday, which can never be a real ship date.
     * Matches Shopify's manual-mode behavior. Does not skip holidays —
     * Shopify's manual mode doesn't either.
     */
    addBusinessDays(from, n) {
      const d = new Date(from);
      // Advance over any weekend the start lands on
      while (d.getDay() === 0 || d.getDay() === 6) {
        d.setDate(d.getDate() + 1);
      }
      let remaining = n;
      while (remaining > 0) {
        d.setDate(d.getDate() + 1);
        const day = d.getDay();
        if (day !== 0 && day !== 6) remaining--;
      }
      return d;
    }
  }
  customElements.define('cart-ship-estimate', CartShipEstimate);

  // ---------- Slot injector ----------

  /**
   * Find Dawn's cart-drawer structure and inject our components into it.
   * Re-runs whenever the drawer re-renders (e.g., after add-to-cart, since
   * Dawn replaces the inner HTML wholesale).
   */
  function injectSlots() {
    const config = readConfig();
    if (!config) return;

    const drawer = document.querySelector('cart-drawer');
    if (!drawer) return;

    // Shipping bar goes above the line items
    if (config.shippingEnabled) {
      const itemsTop = drawer.querySelector('.drawer__inner');
      if (itemsTop && !itemsTop.querySelector('cart-shipping-bar')) {
        const bar = document.createElement('cart-shipping-bar');
        const header = itemsTop.querySelector('.drawer__header');
        if (header) {
          header.insertAdjacentElement('afterend', bar);
        } else {
          itemsTop.prepend(bar);
        }
      }
    }

    // Upsell goes between line items and totals
    if (config.upsellEnabled) {
      const footer = drawer.querySelector('.drawer__footer, .cart-drawer__footer');
      if (footer && !drawer.querySelector('cart-upsell')) {
        const upsell = document.createElement('cart-upsell');
        footer.insertAdjacentElement('beforebegin', upsell);
      }
    }

    // Ship estimate goes inside the footer, above subtotal
    if (config.shipEstimateEnabled) {
      const totals = drawer.querySelector('.cart-drawer__footer .totals, .totals');
      if (totals && !drawer.querySelector('cart-ship-estimate')) {
        const est = document.createElement('cart-ship-estimate');
        totals.insertAdjacentElement('beforebegin', est);
      }
    }
  }

  // Run on load and whenever Dawn re-renders the drawer (it replaces innerHTML
  // on add-to-cart). We debounce to coalesce burst mutations, and the
  // injectSlots function itself is idempotent (it checks if the components
  // already exist before inserting), so re-running it during a mutation
  // is a no-op rather than a loop.
  let injectTimer = null;
  function scheduleInject() {
    if (injectTimer) return;
    injectTimer = setTimeout(() => {
      injectTimer = null;
      injectSlots();
    }, 50);
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectSlots();
    const drawer = document.querySelector('cart-drawer');
    if (!drawer) return;
    const observer = new MutationObserver((mutations) => {
      // Ignore mutations that are only our own injected elements
      const meaningful = mutations.some((m) =>
        [...m.addedNodes, ...m.removedNodes].some(
          (n) =>
            n.nodeType === 1 &&
            !['CART-SHIPPING-BAR', 'CART-UPSELL', 'CART-SHIP-ESTIMATE'].includes(n.nodeName)
        )
      );
      if (meaningful) scheduleInject();
    });
    observer.observe(drawer, { childList: true, subtree: true });
  });
})();
