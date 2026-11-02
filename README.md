# Drifting Drams — Shopify Theme

Forked from Shopify's Dawn theme. Customizations are mostly additive — almost no Dawn files are modified, so upstream changes can be pulled in via `git pull upstream main` with minimal conflict. The exceptions are `layout/theme.liquid` (which mounts the cart-drawer enhancements globally) and `config/settings_schema.json` (which appends a "Cart drawer" settings group) — see below.

## What's customized

Custom files added (no Dawn files modified):

| File | Purpose |
|---|---|
| `sections/main-product-coffee.liquid` | Coffee-focused product page with variant switching via Section Rendering API, responsive gallery, metafield-driven info blocks |
| `sections/brew-method-picker.liquid` | Homepage section with inline-SVG brew method icons linking to filtered collections |
| `sections/coffee-collection-styles.liquid` | Stylesheet loader for collection page tweaks |
| `snippets/coffee-*.liquid` | Tasting notes, brew recommendations, roast meter, media gallery, variant picker |
| `snippets/brew-method-icon.liquid` | Inline SVG icons (AeroPress, pour over, espresso, French press, cold brew, moka, drip) |
| `assets/product-coffee.{css,js}` | Product page styling + web components (`<variant-selects>`, `<media-gallery>`, `<product-form>`) |
| `assets/brew-method-picker.css` | Brew picker styling |
| `assets/collection-coffee.css` | Collection page styling overrides |
| `assets/cart-enhancements.{css,js}` | Cart drawer enhancement web components: `<cart-shipping-bar>`, `<cart-upsell>`, `<cart-ship-estimate>` |
| `templates/product.coffee.json` | Alternate product template — assign per-product in admin |
| `templates/index.coffee.json` | Alternate homepage — set as homepage via theme editor |
| `templates/collection.coffee.json` | Alternate collection template with sidebar filters |

The original `templates/product.json`, `templates/index.json`, and `templates/collection.json` are untouched, so the stock Dawn versions remain available as fallbacks.

## Local development

```sh
# Start a dev server with hot reload against your store
shopify theme dev --store=drifting-drams.myshopify.com

# Push as an unpublished theme to preview before going live
shopify theme push --unpublished
```

## Required admin setup

The theme files alone aren't enough — Shopify needs to know about the metafields and filters before they'll render on the storefront.

### 1. Metafield definitions

Settings → Custom data → Products → Add definition. Create these under namespace `coffee`:

| Key | Type | Used by |
|---|---|---|
| `origin` | Single line text | Product page label, collection filter |
| `tasting_notes` | Single line text — list of values | Product page chips |
| `brew_recommendations` | Rich text | Product page collapsible block |
| `roast_level` | Integer (1–5) | Product page roast meter |
| `brew_methods` | Single line text — list of values | Collection filter |

For decaf, use a product tag `decaf` rather than a metafield — it reads better in the filter UI and is easier to manage in admin (no definition needed, just add the tag to the product).

### 2. Enable filters

Online Store → Navigation → Search & discovery → Filters → Add filter. Add:

- **Origin** (metafield `coffee.origin`)
- **Brew method** (metafield `coffee.brew_methods`)
- **Decaf** (product tag — pick "Product tag" as the filter source, then rename the group label to "Type" so it reads naturally next to "Origin" and "Brew method")

This step is what makes filters appear in the sidebar. Without it, the collection page renders without filter UI even with the coffee template applied.

### 3. Collections

Create collections for at least: `blends`, `single-origin`, and one per brew method (`aeropress`, `pour-over`, `espresso`, `french-press`, `cold-brew`). Smart collections with tag-based rules are the easiest way.

### 4. Assign templates

Per-product: Admin → Products → pick a coffee → right rail → Theme template → "coffee"

Per-collection: Admin → Collections → pick one → right rail → Theme template → "coffee"

Homepage: Online Store → Themes → Customize → top bar template selector → "coffee"

### 5. Cart drawer

Configure in the theme editor: open Customize → top bar → gear icon (Theme settings) → "Cart drawer". The settings live at the theme level, not in a page section, because the enhancement components now mount globally from `layout/theme.liquid` (gated on the merchant's cart type being "drawer"). The group has three sections:

**Free shipping bar**
- Toggle on/off
- Threshold in store currency (number, no symbol — e.g., `50` for $50)
- **Important:** this is a display-only value. Keep it in sync with your actual shipping zones in Settings → Shipping and delivery. If your real free-shipping threshold is $75 but this says $50, the cart will lie to customers.

**Cross-sell ("pairs well with")**
- Toggle on/off
- Fallback collection picker — used when Shopify's recommendations API returns nothing (common on new stores with little order history). Pick a small curated collection of safe upsells.

**Estimated delivery**
- Toggle on/off
- Fulfillment time, transit time min, transit time max — all in business days
- **Mirror these to Shopify's Manual Estimated Delivery Dates** in Settings → Shipping and delivery → Estimated delivery dates. The cart computes dates client-side using the same algorithm Shopify uses at checkout, so matching values means the cart shows the same range customers see at checkout. If they diverge, the messaging diverges.

### Filter URL shape

For reference, filters use this URL pattern, which Shopify generates automatically from the UI:

```
/collections/<handle>?filter.p.m.coffee.origin=Honduras&filter.p.m.coffee.brew_methods=Espresso
```

The brew method picker on the homepage links to `/collections/<handle>` per method — make sure the collection handles match.

## Caveats

- **Variant value casing must be consistent**. If your `brew_methods` metafield has `espresso` but the picker links to `Espresso`, filters won't match. Pick a convention.
- **Each filter group caps at 1000 distinct values** — not relevant unless you scale to thousands of products.
- **Variant availability greying** distinguishes two states: nonexistent combinations are fully disabled, sold-out combinations are still clickable with strikethrough.
- **AJAX add-to-cart** assumes Dawn's `<cart-drawer>` element is on the page. If swapped out later, the fallback dispatches a `cart:added` event.
- **Cart drawer enhancements re-inject after re-renders.** Dawn replaces the drawer's innerHTML on cart mutations; a MutationObserver re-mounts our components. The observer is debounced and skips self-triggered mutations, but it is small ongoing overhead.
- **Delivery estimate is a mirror, not a source of truth.** Shopify doesn't expose its computed dates to storefront Liquid. The cart reproduces Shopify's manual-mode math from theme settings. If you change Shopify's settings, update the cart's too.
- **Cart drawer enhancements mount from `layout/theme.liquid`.** The free-shipping bar, cross-sell, and delivery-estimate components load globally from the layout (in the `cart_type == 'drawer'` block), with their settings in the theme-level "Cart drawer" group. This is the main Dawn-file edit in the fork; upstream changes to `layout/theme.liquid` will conflict on merge.

## Pulling Dawn updates

Standard upstream sync. Almost all customizations are new files, so most upstream merges will be clean. A few files will conflict:

- `README.md` — this section was prepended; resolve by keeping both halves.
- `layout/theme.liquid` — the `<cart-enhancements>` element and the `cart-enhancements.{css,js}` asset tags were added in the cart-drawer block. If upstream changes the cart-drawer render vicinity, re-apply the element and asset tags.
- `config/settings_schema.json` — a "Cart drawer" settings group was appended at the end. Re-apply it if upstream rewrites the file.

```sh
git remote add upstream https://github.com/Shopify/dawn.git  # one time
git fetch upstream
git checkout main
git pull upstream main
```

---

# Dawn (upstream)

The original Dawn README follows. Useful reference for anything not specific to this fork.

[![Build status](https://github.com/shopify/dawn/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Shopify/dawn/actions/workflows/ci.yml?query=branch%3Amain)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?color=informational)](/.github/CONTRIBUTING.md)

[Getting started](#getting-started) |
[Staying up to date with Dawn changes](#staying-up-to-date-with-dawn-changes) |
[Developer tools](#developer-tools) |
[Contributing](#contributing) |
[Code of conduct](#code-of-conduct) |
[Theme Store submission](#theme-store-submission) |
[License](#license)

Dawn represents a HTML-first, JavaScript-only-as-needed approach to theme development. It's Shopify's first source available theme with performance, flexibility, and [Online Store 2.0 features](https://www.shopify.com/partners/blog/shopify-online-store) built-in and acts as a reference for building Shopify themes.

* **Web-native in its purest form:** Themes run on the [evergreen web](https://www.w3.org/2001/tag/doc/evergreen-web/). We leverage the latest web browsers to their fullest, while maintaining support for the older ones through progressive enhancement—not polyfills.
* **Lean, fast, and reliable:** Functionality and design defaults to “no” until it meets this requirement. Code ships on quality. Themes must be built with purpose. They shouldn’t support each and every feature in Shopify.
* **Server-rendered:** HTML must be rendered by Shopify servers using Liquid. Business logic and platform primitives such as translations and money formatting don’t belong on the client. Async and on-demand rendering of parts of the page is OK, but we do it sparingly as a progressive enhancement.
* **Functional, not pixel-perfect:** The Web doesn’t require each page to be rendered pixel-perfect by each browser engine. Using semantic markup, progressive enhancement, and clever design, we ensure that themes remain functional regardless of the browser.

You can find a more detailed version of our theme code principles in the [contribution guide](https://github.com/Shopify/dawn/blob/main/.github/CONTRIBUTING.md#theme-code-principles).

## Getting started
We recommend using Dawn as a starting point for theme development. [Learn more on Shopify.dev](https://shopify.dev/themes/getting-started/create).

> If you're building a theme for the Shopify Theme Store, then you can use Dawn as a starting point. However, the theme that you submit needs to be [substantively different from Dawn](https://shopify.dev/themes/store/requirements#uniqueness) so that it provides added value for merchants. Learn about the [ways that you can use Dawn](https://shopify.dev/themes/tools/dawn#ways-to-use-dawn).

Please note that the main branch may include code for features not yet released. The "stable" version of Dawn is available in the theme store.

## Staying up to date with Dawn changes

Say you're building a new theme off Dawn but you still want to be able to pull in the latest changes, you can add a remote `upstream` pointing to this Dawn repository.

1. Navigate to your local theme folder.
2. Verify the list of remotes and validate that you have both an `origin` and `upstream`:
```sh
git remote -v
```
3. If you don't see an `upstream`, you can add one that points to Shopify's Dawn repository:
```sh
git remote add upstream https://github.com/Shopify/dawn.git
```
4. Pull in the latest Dawn changes into your repository:
```sh
git fetch upstream
git pull upstream main
```

## Developer tools

There are a number of really useful tools that the Shopify Themes team uses during development. Dawn is already set up to work with these tools.

### Shopify CLI

[Shopify CLI](https://github.com/Shopify/shopify-cli) helps you build Shopify themes faster and is used to automate and enhance your local development workflow. It comes bundled with a suite of commands for developing Shopify themes—everything from working with themes on a Shopify store (e.g. creating, publishing, deleting themes) or launching a development server for local theme development.

You can follow this [quick start guide for theme developers](https://shopify.dev/docs/themes/tools/cli) to get started.

### Theme Check

We recommend using [Theme Check](https://github.com/shopify/theme-check) as a way to validate and lint your Shopify themes.

We've added Theme Check to Dawn's [list of VS Code extensions](/.vscode/extensions.json) so if you're using Visual Studio Code as your code editor of choice, you'll be prompted to install the [Theme Check VS Code](https://marketplace.visualstudio.com/items?itemName=Shopify.theme-check-vscode) extension upon opening VS Code after you've forked and cloned Dawn.

You can also run it from a terminal with the following Shopify CLI command:

```bash
shopify theme check
```

### Continuous Integration

Dawn uses [GitHub Actions](https://github.com/features/actions) to maintain the quality of the theme. [This is a starting point](https://github.com/Shopify/dawn/blob/main/.github/workflows/ci.yml) and what we suggest to use in order to ensure you're building better themes. Feel free to build off of it!

#### Shopify/lighthouse-ci-action

We love fast websites! Which is why we created [Shopify/lighthouse-ci-action](https://github.com/Shopify/lighthouse-ci-action). This runs a series of [Google Lighthouse](https://developers.google.com/web/tools/lighthouse) audits for the home, product and collections pages on a store to ensure code that gets added doesn't degrade storefront performance over time.

#### Shopify/theme-check-action

Dawn runs [Theme Check](#Theme-Check) on every commit via [Shopify/theme-check-action](https://github.com/Shopify/theme-check-action).

## Contributing

Want to make commerce better for everyone by contributing to Dawn? We'd love your help! Please read our [contributing guide](https://github.com/Shopify/dawn/blob/main/.github/CONTRIBUTING.md) to learn about our development process, how to propose bug fixes and improvements, and how to build for Dawn.

## Code of conduct

All developers who wish to contribute through code or issues, please first read our [Code of Conduct](https://github.com/Shopify/dawn/blob/main/.github/CODE_OF_CONDUCT.md).

## Theme Store submission

The [Shopify Theme Store](https://themes.shopify.com/) is the place where Shopify merchants find the themes that they'll use to showcase and support their business. As a theme partner, you can create themes for the Shopify Theme Store and reach an international audience of an ever-growing number of entrepreneurs.

Ensure that you follow the list of [theme store requirements](https://shopify.dev/themes/store/requirements) if you're interested in becoming a [Shopify Theme Partner](https://themes.shopify.com/services/themes/guidelines) and building themes for the Shopify platform.

## License

Copyright (c) 2021-present Shopify Inc. See [LICENSE](/LICENSE.md) for further details.
