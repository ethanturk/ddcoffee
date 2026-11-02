# AGENTS.md

Guide for AI agents and developers picking up this codebase. The README is for the merchant; this file is for whoever's modifying the code.

## What this is

A fork of Shopify's Dawn theme for **Drifting Drams**, a coffee company. Customizations were added incrementally across a few sessions covering: product page, homepage, collection page, and cart drawer. Stack is Liquid + vanilla JS web components + CSS using Dawn's variables. No build step.

The merchant is a long-time C# developer working in Liquid for the first time; comments err on the side of explaining Liquid/Shopify idioms.

## Core architectural rule: additive over Dawn

**Almost every customization is a *new file*, not a modification of a Dawn file.** This is the single most important constraint. Reasons:

1. The user runs `git pull upstream main` periodically to get Dawn updates. Modified Dawn files conflict on every pull.
2. Dawn's files are large (the cart drawer snippet is ~580 lines) and well-tested. Forking them means owning bugs Dawn would otherwise fix.
3. Coffee-specific behavior is conceptually separate from base theme behavior — separation in the filesystem reflects separation in concept.

There are **two exceptions**, both for the cart drawer enhancements: `layout/theme.liquid` mounts the `<cart-enhancements>` element and its CSS/JS assets (inside the `cart_type == 'drawer'` block), and `config/settings_schema.json` carries the "Cart drawer" settings group. The underlying snippet `snippets/cart-drawer.liquid` is still untouched — enhancements attach to it via JS slot injection, never markup. An earlier version of this fork replaced `sections/cart-drawer.liquid` as a wrapper, but that section was never rendered on any page — Dawn's layout renders the *snippet* — so the replacement was dead code and the section file has since been deleted. If the same trap tempts you again: a replacement section file is inert unless something renders it. If you find yourself wanting to make a *third* exception, push back hard against that instinct first — there's almost always an additive way.

**Practical implication for new work:** when extending, prefer creating new sections/snippets/assets over editing existing ones. If a Dawn file is "in the way," find the JS or CSS hook to layer on top of it instead of editing it.

## Customization inventory

| Area | New files | Pattern |
|---|---|---|
| Product page | `sections/main-product-coffee.liquid`, `snippets/coffee-*.liquid`, `assets/product-coffee.{css,js}`, `templates/product.coffee.json` | Custom section + alternate JSON template merchants assign per-product. Web components: `<coffee-variant-selects>`, `<coffee-media-gallery>`, `<coffee-product-info>`, `<coffee-product-form>`. The `coffee-` prefix isn't cosmetic — Dawn's `global.js` defines `variant-selects` on every page, so a bare re-`define` throws `NotSupportedError` and kills the rest of the script. |
| Homepage | `sections/brew-method-picker.liquid`, `snippets/brew-method-icon.liquid`, `assets/brew-method-picker.css`, `templates/index.coffee.json` | Custom section for brew picker; homepage template uses stock Dawn sections + the new picker. Inline SVG icons (no external asset). |
| Collection page | `sections/coffee-collection-styles.liquid`, `assets/collection-coffee.css`, `templates/collection.coffee.json` | Uses Dawn's `main-collection-product-grid` with `filter_type: vertical`; styling overlay only. Filters configured in admin (Search & discovery), not theme. |
| Cart drawer | `assets/cart-enhancements.{css,js}` (mounted from `layout/theme.liquid`; settings in the "Cart drawer" group of `settings_schema.json`) | Three independent web components (`<cart-shipping-bar>`, `<cart-upsell>`, `<cart-ship-estimate>`) mounted into Dawn's drawer via JS slot injection. Dawn snippet untouched. |

## Conventions

### Naming

- **Coffee-domain customizations** use `coffee-` or `coffee_` prefix: `main-product-coffee.liquid`, `coffee-tasting-notes.liquid`, `templates/product.coffee.json`. The dot-separated template names (`product.coffee.json`) follow Shopify's alternate template convention — merchants pick "coffee" from a dropdown in admin.
- **Cart enhancements** use `cart-` prefix: `cart-shipping-bar`, `cart-upsell`, `cart-ship-estimate`, `cart-enhancements.{css,js}`. Distinct namespace because they're tied to Dawn's cart drawer specifically.
- **CSS classes** in custom sections use BEM-style: `.product-coffee__title`, `.brew-picker__icon`, `.cart-shipping-bar__fill`. Stay consistent inside each component.

### Web component pattern

When adding interactive UI, prefer a Custom Element over framework-style code. The convention used throughout:

```js
class MyThing extends HTMLElement {
  constructor() {
    super();
    // bind config, hook events
  }
  connectedCallback() {
    // attach listeners, do initial render
  }
  disconnectedCallback() {
    // remove listeners (important for cart components that get re-mounted)
  }
}
customElements.define('my-thing', MyThing);
```

Liquid renders `<my-thing>` with data attributes for config; JS reads them. No framework, no state management library — `EventTarget` subclasses or plain custom events for component-to-component communication.

### CSS — use Dawn's design tokens

All custom styling uses Dawn's CSS custom properties so it inherits the merchant's theme settings (colors, fonts, etc.):

- `rgb(var(--color-foreground))`, `rgb(var(--color-background))`, `rgba(var(--color-foreground), 0.6)` for opacity
- `var(--font-heading-family)`, `var(--font-body-family)`
- `var(--media-radius, 8px)` with fallback

If a future Drifting Drams brand identity wants colors *outside* Dawn's palette (e.g., a coffee-brown accent), introduce a new custom property in one place and use it consistently. Don't sprinkle hex values throughout component CSS.

### Schema settings live on sections, not in `settings_schema.json`

`config/settings_schema.json` is a Dawn file with hundreds of lines that Shopify ships and updates. Editing it = merge conflict on every upstream pull. So:

- Coffee-specific settings live on the **section schemas** that use them
- Global theme settings go in `settings_schema.json` only if there's no choice. The one case that has arisen: the **cart drawer enhancements** mount from `layout/theme.liquid` (outside any template section), so their settings can't live on a section — they sit in a "Cart drawer" group (ids prefixed `cart_`) in `settings_schema.json`

This makes the merchant edit experience slightly less centralized but keeps the file boundary clean.

## Decision trees for common changes

### "Add a new product page block"

1. Create `snippets/coffee-<thing>.liquid`. Should accept its data as parameters (e.g., `{% render 'coffee-thing', value: product.metafields.coffee.thing %}`), not reach into globals.
2. Add the `{% render %}` call in `sections/main-product-coffee.liquid` at the right position.
3. Style it in `assets/product-coffee.css` using Dawn variables.
4. If it needs JS: prefer extending an existing web component over creating a new one if the behavior overlaps. New web component goes in `assets/product-coffee.js`.

### "Add a new metafield"

1. The merchant must create the definition in admin (Settings → Custom data → Products, namespace `coffee`). Document the new metafield in the README's metafield table.
2. Reference in Liquid: `{{ product.metafields.coffee.<key> }}`. For list types, iterate `{{ metafield.value }}` not the wrapper.
3. If it should be filterable, the merchant also enables it in Online Store → Navigation → Search & discovery.

### "Add a new homepage section"

1. New section file: `sections/<name>.liquid` with `{% schema %}` block (settings + blocks + presets).
2. To make it appear on the homepage by default, add to `templates/index.coffee.json`. To let merchants add it manually, just ship the section — they pick it from "Add section" in the theme editor.
3. Don't modify `templates/index.json` (the Dawn default) — that's the fallback if `index.coffee.json` is unset.

### "Add a new cart drawer feature"

This is the trickiest area because of the Dawn snippet you can't edit. Pattern:

1. Add a new web component class to `assets/cart-enhancements.js`. Subscribe to `cartState` for change events.
2. Add a new injection slot in the `injectSlots()` function — find a DOM target inside `<cart-drawer>` and insert the component there. Be defensive: check the target exists, check the component isn't already inserted (the slot injection is idempotent and re-runs on every drawer re-render).
3. Add the setting to the "Cart drawer" group in `config/settings_schema.json` (prefix the id with `cart_`). Pass the value to the `<cart-enhancements>` element in `layout/theme.liquid` via a `data-*` attribute.
4. Read the new config in `readConfig()`.
5. Style in `assets/cart-enhancements.css` using Dawn variables.

### "Add a new filter to collection pages"

The theme doesn't define filters — Shopify does, in admin. To add one:

1. The merchant creates the metafield (or uses a product tag).
2. The merchant enables it in Online Store → Navigation → Search & discovery → Filters.
3. The theme will render it automatically because the collection grid section uses `collection.filters`.
4. If the filter needs special styling (e.g., color swatches), edit `assets/collection-coffee.css`.

### "Make a Dawn behavior different"

First, look for a section setting that controls it. Dawn's sections are highly configurable — toggling `filter_type` from `horizontal` to `vertical` is how we got sidebar filters, no code needed.

If no setting exists, the next-best is CSS override in one of our custom stylesheets. Last resort is editing a Dawn file, which should require a justification stronger than "it's a small change" because *every* future merge will hit that conflict.

## Pitfalls already discovered

### MutationObserver infinite loops

The cart enhancement injector uses a MutationObserver on `<cart-drawer>` because Dawn re-renders the drawer's innerHTML on add-to-cart. The naive observer callback that calls `injectSlots()` will trigger itself when injection adds elements. The fix in `cart-enhancements.js`:

- The observer callback **filters out mutations whose only added/removed nodes are our own component tags** (`CART-SHIPPING-BAR`, `CART-UPSELL`, `CART-SHIP-ESTIMATE`)
- A 50ms debounce coalesces burst mutations
- `injectSlots()` is **idempotent** — it checks `!drawer.querySelector('cart-shipping-bar')` before inserting

If you add a new injected component, **update the node-name filter list** or the observer will treat your component's insertion as a meaningful mutation and re-trigger.

### JSON inside `{% schema %}` blocks

Section schemas are JSON inside Liquid `{% schema %}...{% endschema %}` blocks. Validate them manually — there's no theme-check baked into this sandbox. Quick check:

```py
import re, json
content = open('sections/your-section.liquid').read()
m = re.search(r'\{% schema %\}(.*?)\{% endschema %\}', content, re.DOTALL)
json.loads(m.group(1))  # raises on invalid JSON
```

Common gotchas: trailing commas in arrays/objects (JSON forbids them), unescaped quotes inside strings, and using single quotes (JSON requires double).

### Liquid metafield access — `.value` matters

For list-type metafields, use `metafield.value`, not the metafield itself, when iterating:

```liquid
{%- for note in product.metafields.coffee.tasting_notes.value -%}
```

For single-value metafields, the bare expression usually works:

```liquid
{{ product.metafields.coffee.origin }}
```

Rich text needs `metafield_tag`:

```liquid
{{ product.metafields.coffee.brew_recommendations | metafield_tag }}
```

This trips people up. If you see "Liquid error" or `[object Object]` in rendered output, it's almost always wrong metafield-access syntax.

### Filter value casing

The brew method picker's URLs and the metafield values must match exactly. If `coffee.brew_methods` contains `"espresso"` but the picker links to `?filter.p.m.coffee.brew_methods=Espresso`, the filter returns nothing. The convention in this codebase: **stored values follow whatever casing the merchant uses in admin, picker labels match that casing exactly.** Don't transform case in either direction in code.

### Shopify Section Rendering API for variant switching

The product page uses `fetch(productUrl + '?variant=' + id + '&section_id=' + sectionId)` to get an HTML fragment for the variant's price and button state. This is Shopify's Section Rendering API. Two notes:

- The section ID is the section's *Liquid* `section.id`, not the HTML element's `id`. Same value in practice but conceptually distinct.
- Don't try to JSON-parse the response — it's HTML. Use `DOMParser` to extract the elements you need.

### Variant availability — two states, not one

The variant picker distinguishes between **nonexistent combinations** (no variant exists with this option set) and **sold out** (variant exists, zero inventory). The first is fully disabled; the second is clickable so the user sees "Sold out" messaging. CSS uses `[data-unavailable]` for the strikethrough and `input:disabled + label` for the nonclickable state. Don't collapse these into a single state — it's a deliberate UX choice.

## Validation workflow

Since there's no build step or CI in this fork, validation before commit is manual:

1. **JSON syntax**: schema blocks and template JSON (`templates/*.json`). Use the regex+`json.loads` snippet above.
2. **Liquid syntax**: `shopify theme check` if available locally; otherwise visual inspection. Theme Check is what Dawn uses in CI — see Dawn's `.github/workflows/ci.yml`.
3. **Live preview**: `shopify theme dev --store=<store>` runs a local dev server with hot reload. Push to a draft theme with `shopify theme push --unpublished` for full preview without affecting the live store.
4. **Date math, business-day logic, etc.**: write a node one-liner. Example used during development:

   ```sh
   node -e "function addBusinessDays(from, n) { /* ... */ }
            console.log(addBusinessDays(new Date(2025,2,15), 1).toDateString());"
   ```

## What's deliberately not done

So a future session doesn't "fix" something that was an intentional choice:

- **No build step.** No webpack, no Sass, no TypeScript. The theme runs as-is. Adding tooling means the merchant or future dev needs that toolchain to make a single CSS change. Not worth the cost at this scale.
- **No state management library.** `EventTarget` and custom events are the bus. The cart drawer has one `CartState` singleton that the three components subscribe to. Replacing this with Redux/Zustand/etc. would be over-engineering for three components.
- **No client-side framework.** Vanilla web components match Dawn's own conventions and ship without a runtime cost. React/Vue/Svelte would be a foreign body.
- **Free shipping threshold and delivery estimate are theme settings, not API-derived.** The Storefront API can give real values (see `cart.deliveryGroups[].deliveryOptions[].minEstimatedDeliveryDate`) but requires a token and GraphQL setup. We chose the simpler mirror-the-settings approach. If you later add a Storefront API token, the delivery estimate component is the prime candidate for upgrading to pull real values.
- **No holiday handling** in the delivery estimate. Shopify's manual mode doesn't either. If a future session adds it, add it in both places or they'll diverge.
- **AJAX add-to-cart only refreshes Dawn's sections**, not arbitrary parts of the page. The pattern uses Shopify's `?sections=` parameter so the cart drawer/icon-bubble update with one round-trip. Don't replace this with a separate cart fetch — it'll double the request count.
- **`templates/product.json`, `templates/index.json`, `templates/collection.json` are intentionally untouched.** They're the fallback for products/pages/collections that haven't been opted into the coffee templates yet. If a product is created in admin without the "coffee" template assigned, it should still render acceptably with Dawn defaults.

## Git workflow notes

- The user's preferences say: **don't commit or push unless explicitly asked.** Default to leaving changes uncommitted in the working tree.
- The user works in C# / Rider mainly; Liquid and theme development is secondary. Don't assume tooling familiarity with `shopify` CLI — surface the commands when relevant.
- Patches have been the handoff mechanism (`git format-patch main..coffee-product-page --stdout > coffee-product-page.patch`) because the AI sandbox can't authenticate to GitHub. The user applies them locally with `git am < coffee-product-page.patch` and pushes from their machine.

## Reading order for context

If you're new to this codebase and need to understand it quickly:

1. **`README.md`** — what the theme does, admin setup the merchant needs
2. **This file** — how to modify it
3. **`sections/main-product-coffee.liquid`** — the most representative custom section; shows the schema + snippet composition + JS hook pattern
4. **`assets/cart-enhancements.js`** — the most complex JS; shows the web component pattern, cart state subscription, slot injection, and the MutationObserver dance
5. **`templates/product.coffee.json`** — how alternate templates are structured

Skip the Dawn files until you need them; they're large and self-contained.
