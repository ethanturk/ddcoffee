/**
 * Drifting Drams — Coffee product page JS
 *
 * Vanilla web components, no dependencies. Patterns:
 *  - <coffee-variant-selects> intercepts variant changes, updates URL and
 *    re-fetches the rendered section for price/availability.
 *  - <coffee-media-gallery> handles thumbnail clicks.
 *  - <coffee-product-form> handles AJAX add-to-cart with cart drawer refresh.
 */

// ---------- Variant selection ----------

class VariantSelects extends HTMLElement {
  constructor() {
    super();
    this.addEventListener('change', this.onVariantChange);
  }

  connectedCallback() {
    const variantsScript = this.querySelector('[data-variants]');
    this.variants = variantsScript ? JSON.parse(variantsScript.textContent) : [];
    this.sectionId = this.dataset.section;
    this.productUrl = this.dataset.url;

    // Set initial availability state on load
    this.updateAvailability(this.getSelectedOptions());
  }

  onVariantChange = () => {
    const selectedOptions = this.getSelectedOptions();
    const variant = this.findMatchingVariant(selectedOptions);

    this.updateSelectedLabels(selectedOptions);
    this.updateAvailability(selectedOptions);

    if (!variant) {
      this.setUnavailable();
      return;
    }

    this.updateHiddenInputs(variant);
    this.updateUrl(variant);
    this.updateMedia(variant);
    this.fetchUpdatedSection(variant);
  };

  /**
   * For each option position, find which values can produce an available variant
   * given the *other* currently selected options. Disable the rest.
   * This mirrors how Shopify's own variant pickers behave — only the option
   * the user is currently touching is held fixed; the others are matched.
   */
  updateAvailability(selectedOptions) {
    // Group radios/selects by their option index
    const optionGroups = new Map();
    this.querySelectorAll('[data-option-index]').forEach((el) => {
      const idx = parseInt(el.dataset.optionIndex, 10);
      if (!optionGroups.has(idx)) optionGroups.set(idx, []);
      optionGroups.get(idx).push(el);
    });

    optionGroups.forEach((controls, optionIndex) => {
      controls.forEach((control) => {
        const candidateValue = control.tagName === 'OPTION' ? control.value : control.value;
        // Skip the placeholder option element handling: option elements are children of select
        if (control.tagName === 'SELECT') return;

        // Build the hypothetical option set: same selections, but this option = candidateValue
        const hypothetical = [...selectedOptions];
        hypothetical[optionIndex] = candidateValue;

        const hasAvailable = this.variants.some(
          (v) =>
            v.available &&
            v.options.every((opt, i) => opt === hypothetical[i])
        );

        const hasAny = this.variants.some((v) =>
          v.options.every((opt, i) => opt === hypothetical[i])
        );

        this.setOptionState(control, { available: hasAvailable, exists: hasAny });
      });

      // Handle <select> options separately (their <option> children, not the select itself)
      controls
        .filter((c) => c.tagName === 'SELECT')
        .forEach((select) => {
          [...select.options].forEach((opt) => {
            const hypothetical = [...selectedOptions];
            hypothetical[optionIndex] = opt.value;
            const hasAvailable = this.variants.some(
              (v) => v.available && v.options.every((o, i) => o === hypothetical[i])
            );
            const hasAny = this.variants.some((v) =>
              v.options.every((o, i) => o === hypothetical[i])
            );
            opt.disabled = !hasAny;
            if (hasAny && !hasAvailable) {
              if (!opt.textContent.includes('—')) opt.textContent = `${opt.textContent} — sold out`;
            } else {
              opt.textContent = opt.textContent.replace(/ — sold out$/, '');
            }
          });
        });
    });
  }

  setOptionState(input, { available, exists }) {
    // input is a radio; find its label sibling
    const label = this.querySelector(`label[for="${input.id}"]`);
    if (!label) return;

    if (!exists) {
      // Combination doesn't exist at all — fully disabled
      input.disabled = true;
      label.dataset.unavailable = 'true';
      label.dataset.soldOut = '';
    } else if (!available) {
      // Combination exists but is sold out — keep selectable, mark as sold out
      input.disabled = false;
      label.dataset.unavailable = 'true';
      label.dataset.soldOut = 'true';
    } else {
      input.disabled = false;
      delete label.dataset.unavailable;
      delete label.dataset.soldOut;
    }
  }

  getSelectedOptions() {
    // Read both radio inputs and selects, ordered by option index
    const options = [];
    this.querySelectorAll('[data-option-index]').forEach((el) => {
      const idx = parseInt(el.dataset.optionIndex, 10);
      let value = null;
      if (el.tagName === 'SELECT') {
        value = el.value;
      } else if (el.type === 'radio' && el.checked) {
        value = el.value;
      }
      if (value !== null) options[idx] = value;
    });
    return options;
  }

  findMatchingVariant(selectedOptions) {
    return this.variants.find((v) =>
      v.options.every((opt, i) => opt === selectedOptions[i])
    );
  }

  updateSelectedLabels(selectedOptions) {
    this.querySelectorAll('.product-coffee__variant-selected').forEach((el) => {
      const idx = parseInt(el.dataset.optionIndex, 10);
      if (selectedOptions[idx]) el.textContent = selectedOptions[idx];
    });
  }

  updateHiddenInputs(variant) {
    const form = document.querySelector(`#product-form-${this.sectionId}`);
    if (!form) return;
    const idInput = form.querySelector('input[name="id"]');
    if (idInput) idInput.value = variant.id;
  }

  updateUrl(variant) {
    if (!variant?.id) return;
    window.history.replaceState({}, '', `${this.productUrl}?variant=${variant.id}`);
  }

  updateMedia(variant) {
    if (!variant.featured_media) return;
    const gallery = document.querySelector(`#MediaGallery-${this.sectionId}`);
    if (gallery && typeof gallery.showMedia === 'function') {
      gallery.showMedia(variant.featured_media.id);
    }
  }

  async fetchUpdatedSection(variant) {
    try {
      const response = await fetch(`${this.productUrl}?variant=${variant.id}&section_id=${this.sectionId}`);
      if (!response.ok) throw new Error(`Section fetch failed: ${response.status}`);
      const text = await response.text();
      const parser = new DOMParser();
      const html = parser.parseFromString(text, 'text/html');

      // Replace price
      const newPrice = html.querySelector(`#price-${this.sectionId}`);
      const currentPrice = document.querySelector(`#price-${this.sectionId}`);
      if (newPrice && currentPrice) currentPrice.innerHTML = newPrice.innerHTML;

      // Replace add-to-cart button state
      const newButton = html.querySelector(`#product-form-${this.sectionId} [name="add"]`);
      const currentButton = document.querySelector(`#product-form-${this.sectionId} [name="add"]`);
      if (newButton && currentButton) {
        currentButton.innerHTML = newButton.innerHTML;
        currentButton.disabled = newButton.disabled;
      }
    } catch (err) {
      console.error('[product-coffee] variant fetch failed:', err);
    }
  }

  setUnavailable() {
    const button = document.querySelector(`#product-form-${this.sectionId} [name="add"]`);
    if (button) {
      button.disabled = true;
      const text = button.querySelector('.add-to-cart-text');
      if (text) text.textContent = 'Unavailable';
    }
  }
}
customElements.define('coffee-variant-selects', VariantSelects);

// ---------- Product info wrapper (mostly a hook for future extension) ----------

class ProductInfo extends HTMLElement {}
customElements.define('coffee-product-info', ProductInfo);

// ---------- Media gallery ----------

class MediaGallery extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.thumbs = this.querySelectorAll('.product-coffee__gallery-thumb');
    this.slides = this.querySelectorAll('.product-coffee__gallery-slide');
    this.thumbs.forEach((thumb) => {
      thumb.addEventListener('click', () => this.showMedia(thumb.dataset.mediaId));
    });
  }

  showMedia(mediaId) {
    if (!mediaId) return;
    const idStr = String(mediaId);
    this.slides.forEach((slide) => {
      const match = slide.dataset.mediaId === idStr;
      slide.classList.toggle('is-active', match);
      if (match) {
        slide.removeAttribute('hidden');
      } else {
        slide.setAttribute('hidden', '');
      }
    });
    this.thumbs.forEach((thumb) => {
      thumb.classList.toggle('is-active', thumb.dataset.mediaId === idStr);
    });
  }
}
customElements.define('coffee-media-gallery', MediaGallery);

// ---------- Product form (AJAX add to cart) ----------

class ProductForm extends HTMLElement {
  constructor() {
    super();
    this.form = this.querySelector('form');
    this.button = this.querySelector('[name="add"]');
    if (this.form) {
      this.form.addEventListener('submit', this.onSubmit);
    }
  }

  onSubmit = async (evt) => {
    evt.preventDefault();
    if (this.button.disabled) return;

    this.setLoading(true);
    const formData = new FormData(this.form);

    // Include sections so cart drawer/notification update with one round-trip
    const sections = this.getCartSections();
    if (sections.length) formData.append('sections', sections.join(','));
    formData.append('sections_url', window.location.pathname);

    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { Accept: 'application/javascript', 'X-Requested-With': 'XMLHttpRequest' },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || data.status) {
        this.handleError(data);
        return;
      }

      this.handleSuccess(data);
    } catch (err) {
      console.error('[product-coffee] add to cart failed:', err);
    } finally {
      this.setLoading(false);
    }
  };

  getCartSections() {
    const sections = [];
    if (document.getElementById('cart-drawer')) sections.push('cart-drawer');
    if (document.getElementById('cart-icon-bubble')) sections.push('cart-icon-bubble');
    if (document.getElementById('cart-notification')) sections.push('cart-notification');
    return sections;
  }

  handleSuccess(data) {
    // Update cart bubble/drawer if Dawn's components are present
    if (data.sections) {
      Object.entries(data.sections).forEach(([id, html]) => {
        const target = document.getElementById(id);
        if (target) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const replacement = doc.querySelector(`#${id}`) || doc.querySelector('.shopify-section');
          if (replacement) target.innerHTML = replacement.innerHTML;
        }
      });
    }

    // Open cart drawer if Dawn's element exists
    const drawer = document.querySelector('cart-drawer');
    if (drawer && typeof drawer.open === 'function') {
      drawer.open();
    } else {
      // Fall back: fire an event so theme can react
      document.dispatchEvent(new CustomEvent('cart:added', { detail: data }));
    }
  }

  handleError(data) {
    console.warn('[product-coffee] add to cart error:', data);
    // Could surface inline error here; keeping minimal for now
  }

  setLoading(isLoading) {
    if (!this.button) return;
    this.button.classList.toggle('loading', isLoading);
    this.button.disabled = isLoading;
    const spinner = this.button.querySelector('.loading-overlay__spinner');
    if (spinner) spinner.classList.toggle('hidden', !isLoading);
  }
}
customElements.define('coffee-product-form', ProductForm);
