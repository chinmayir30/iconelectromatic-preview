/**
 * Products Catalog Page — ICON ELECTROMATIC
 * Hierarchical Navigation: Companies (15 OEMs) → Categories → Products
 * Direct source: 'Icon Website Product Info - Mrora.v2.xlsx'
 */
import { ContentService } from '../data/ContentService.js';
import { CatalogService } from '../data/CatalogService.js';
import { getRouteSearchParams } from '../router.js';

let catalogData = null;
let catalogNotice = '';
let catalogLoadPromise = null;

function getAllOEMs() {
  return catalogData || ContentService.getData('products') || [];
}

function getActiveOEMs() {
  return getAllOEMs().filter(o => o.visible !== false);
}

function getActiveOEM(oemId) {
  return getAllOEMs().find(o => o.id === oemId) || null;
}

function getActiveCategories(oemId) {
  const oem = getActiveOEM(oemId);
  if (!oem || !Array.isArray(oem.categories)) return [];
  return oem.categories.filter(c => c.visible !== false);
}

function getActiveCategory(oemId, categoryId) {
  const cats = getActiveCategories(oemId);
  return cats.find(c => c.id === categoryId) || null;
}

function getActiveProductsForCategory(oemId, categoryId) {
  const cat = getActiveCategory(oemId, categoryId);
  if (!cat || !Array.isArray(cat.products)) return [];
  return cat.products.filter(p => p.visible !== false);
}

function getActiveTotalOEMCount() {
  return getActiveOEMs().length;
}

function getActiveTotalCategoryCount() {
  return getActiveOEMs().reduce((sum, o) => sum + (o.categories ? o.categories.filter(c => c.visible !== false).length : 0), 0);
}

function getActiveTotalProductCount() {
  return getActiveOEMs().reduce((sum, o) => {
    if (!o.categories) return sum;
    return sum + o.categories.filter(c => c.visible !== false).reduce((pSum, c) => {
      return pSum + (c.products ? c.products.filter(p => p.visible !== false).length : 0);
    }, 0);
  }, 0);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeDelimiters(text) {
  if (!text) return '';
  return text.toLowerCase().replace(/[/?_.\-+,\(\)\[\]#*&^%$@!~|\\:;'"<>]/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[m][n];
}

function isFuzzyWordMatch(queryWord, targetWord) {
  if (!queryWord || !targetWord) return false;
  if (queryWord === targetWord) return true;
  if (queryWord.length >= 3 && targetWord.includes(queryWord)) return true;
  
  if (queryWord.length < 4 || targetWord.length < 4) return false;

  if (/\d/.test(queryWord) || /\d/.test(targetWord)) {
    return false;
  }

  const maxDist = queryWord.length >= 7 ? 2 : 1;
  const dist = levenshtein(queryWord, targetWord);
  if (dist <= maxDist) return true;

  if (Math.abs(queryWord.length - targetWord.length) <= 1 && queryWord.length >= 6 && dist <= 3) {
    if (queryWord[0] === targetWord[0] && queryWord[1] === targetWord[1]) {
      return true;
    }
  }

  return false;
}

export function getAllProductsFlattened() {
  const oems = getActiveOEMs();
  const products = [];
  oems.forEach(oem => {
    (oem.categories || []).filter(c => c.visible !== false).forEach(cat => {
      (cat.products || []).filter(p => p.visible !== false).forEach(prod => {
        products.push({
          ...prod,
          categoryId: cat.id,
          categoryName: cat.name,
          oemId: oem.id,
          oemName: oem.name,
          oemShort: oem.shortName || oem.name,
          oemAccent: oem.accentColor || '#2563EB',
          oemDefaultImage: oem.defaultImage || '',
          oemSpecialty: oem.specialty || ''
        });
      });
    });
  });
  return products;
}

export function searchProducts(allProducts, rawQuery, activeSpecialty = 'all') {
  if (!rawQuery || !rawQuery.trim()) return [];
  const query = rawQuery.trim().toLowerCase();
  const normQuery = normalizeDelimiters(query);
  const compactQuery = query.replace(/[^a-z0-9]/gi, '');
  const queryTokens = normQuery.split(/\s+/).filter(Boolean);

  const scored = [];

  for (const product of allProducts) {
    if (activeSpecialty && activeSpecialty !== 'all') {
      if (product.oemSpecialty !== activeSpecialty) continue;
    }

    const name = (product.name || '').toLowerCase();
    const desc = (product.description || '').toLowerCase();
    const apps = (product.applications || '').toLowerCase();
    const cat = (product.categoryName || product.category || '').toLowerCase();
    const oem = (product.oemName || product.oem || '').toLowerCase();
    const oemShort = (product.oemShort || '').toLowerCase();

    const normName = normalizeDelimiters(product.name);
    const compactName = name.replace(/[^a-z0-9]/gi, '');
    const normCat = normalizeDelimiters(cat);
    const normOem = normalizeDelimiters(oem);

    // 1. Exact Name Match (Highest priority)
    if (name === query || normName === normQuery) {
      scored.push({ product, score: 300 });
      continue;
    }

    // 2. Starts with query in product name
    if (name.startsWith(query) || normName.startsWith(normQuery)) {
      scored.push({ product, score: 200 });
      continue;
    }

    // 3. Substring match directly in product name
    if (name.includes(query) || normName.includes(normQuery)) {
      scored.push({ product, score: 150 });
      continue;
    }

    // 4. Compact match in product name (e.g. "rtduroid" or "ro4350" ignoring punctuation/spaces)
    if (compactQuery.length >= 3 && compactName.includes(compactQuery)) {
      scored.push({ product, score: 130 });
      continue;
    }

    // 5. Query tokens all present in product name
    if (queryTokens.length > 1) {
      const nameTokens = normName.split(/\s+/).filter(Boolean);
      const allTokensInName = queryTokens.every(qT => 
        nameTokens.some(nT => nT === qT || (qT.length >= 3 && nT.includes(qT)))
      );
      if (allTokensInName) {
        scored.push({ product, score: 120 });
        continue;
      }
    }

    // 6. Typo-tolerant token match in product name
    if (queryTokens.length > 0) {
      const nameTokens = normName.split(/\s+/).filter(Boolean);
      let matchedNameTokens = 0;
      for (const qT of queryTokens) {
        if (nameTokens.some(nT => isFuzzyWordMatch(qT, nT))) {
          matchedNameTokens++;
        }
      }
      if (matchedNameTokens === queryTokens.length) {
        scored.push({ product, score: 100 });
        continue;
      }
    }

    // 7. Substring in Category or OEM Name (Secondary priority)
    if (cat.includes(query) || normCat.includes(normQuery)) {
      scored.push({ product, score: 70 });
      continue;
    }

    if (oem.includes(query) || oemShort.includes(query) || normOem.includes(normQuery)) {
      scored.push({ product, score: 60 });
      continue;
    }

    // 8. Content match in Description or Applications (Lowest priority)
    if (desc.includes(query) || apps.includes(query)) {
      scored.push({ product, score: 40 });
      continue;
    }

    // 9. Token match across Category/OEM
    if (queryTokens.length > 0) {
      const targetTokens = `${normCat} ${normOem}`.split(/\s+/).filter(Boolean);
      let matchedTokens = 0;
      for (const qT of queryTokens) {
        if (targetTokens.some(tT => isFuzzyWordMatch(qT, tT))) {
          matchedTokens++;
        }
      }
      if (matchedTokens === queryTokens.length) {
        scored.push({ product, score: 30 });
      }
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.product.name || '').localeCompare(b.product.name || '');
  });

  return scored.map(s => s.product);
}

let navState = {
  level: 'oems',       // 'oems' | 'categories' | 'products'
  oemId: null,
  categoryId: null,
  activeFilter: 'all', // for OEM filter
  searchQuery: '',
  viewMode: 'cards'    // 'cards' | 'table'
};

export function renderProductsPage() {
  const params = getRouteSearchParams();

  navState.level = params.get('level') || 'oems';
  navState.oemId = params.get('oem') || null;
  navState.categoryId = params.get('category') || null;
  navState.searchQuery = params.get('q') || params.get('search') || navState.searchQuery || '';

  return `
    <div class="page-content catalog-page" id="catalog-page" style="min-height:100vh;">
      ${renderPageShell()}
    </div>
  `;
}

function renderPageShell() {
  const totalProds = getActiveTotalProductCount();
  const totalCats = getActiveTotalCategoryCount();
  const totalOEMs = getActiveTotalOEMCount();

  return `
    <!-- Unified Page Hero Banner (Blue in light theme) -->
    <section class="page-hero-banner">
      <div class="container">
        <!-- Interactive Breadcrumb matching all pages -->
        <nav class="breadcrumb-dark catalog-breadcrumb-nav" id="catalog-breadcrumb">
          ${renderBreadcrumb()}
        </nav>

        <!-- Unified Page Header matching Partners, Services, Blogs, About -->
        <div class="page-header-unified catalog-page-header" style="margin-bottom:0;">
          <h1 class="page-title-unified">Product Portfolio &amp; Component Catalog</h1>
          <p class="page-lead-unified">
            Authorized distributor for world-leading RF, microwave, mmWave, semiconductor, and Hi-Rel materials manufacturers.
            Explore authorized global OEM partners, multi-frequency categories, and specialized product lines.
          </p>

          <!-- Trust & Capability Highlights matching Partners and Services -->
          <div class="catalog-trust-strip" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:24px;margin-bottom:0;">
            <div class="catalog-trust-pill">
              <i class="fa-solid fa-industry" style="color:var(--logo-red-light);"></i>
              <span><strong>${totalOEMs}</strong> Global OEM Partners</span>
            </div>
            <div class="catalog-trust-pill">
              <i class="fa-solid fa-shapes" style="color:var(--logo-red-light);"></i>
              <span><strong>${totalCats}</strong> Specialized Categories</span>
            </div>
            <div class="catalog-trust-pill">
              <i class="fa-solid fa-microchip" style="color:#10B981;"></i>
              <span><strong>${totalProds}</strong> Precision Products &amp; Lines</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Main Content View -->
    <div class="page-main-body" style="padding-top:var(--space-8);padding-bottom:var(--space-24);">
      <div class="container">
        <div id="catalog-content">
          ${renderCurrentLevel()}
        </div>
      </div>
    </div>
    ${catalogNotice ? `<p class="catalog-api-notice" role="status">${catalogNotice}</p>` : ''}
  `;
}

function renderBreadcrumb() {
  const crumbs = [
    { label: 'Home', route: '/' },
    { label: 'Products', level: 'oems' }
  ];

  if (navState.oemId) {
    const oem = getActiveOEM(navState.oemId);
    crumbs.push({
      label: oem ? oem.shortName : navState.oemId,
      level: 'categories',
      oemId: navState.oemId
    });
  }

  if (navState.categoryId && navState.oemId) {
    const cat = getActiveCategory(navState.oemId, navState.categoryId);
    crumbs.push({
      label: cat ? cat.name : navState.categoryId,
      level: 'products',
      oemId: navState.oemId,
      categoryId: navState.categoryId
    });
  }

  return crumbs.map((c, i) => {
    const isLast = i === crumbs.length - 1;
    const sep = i > 0 ? '<span class="sep"><i class="fa-solid fa-chevron-right" style="font-size:0.7rem;"></i></span>' : '';
    if (isLast) {
      return `${sep}<span style="color:var(--text-white);font-weight:600;" class="crumb-current">${c.label}</span>`;
    }
    if (c.route) {
      return `${sep}<a data-route="${c.route}">${c.label}</a>`;
    }
    const params = buildNavParams(c.level, c.oemId, c.categoryId);
    return `${sep}<a class="crumb-link" data-nav-params="${params}" style="cursor:pointer;">${c.label}</a>`;
  }).join('');
}

function buildNavParams(level, oemId, categoryId) {
  const p = new URLSearchParams();
  p.set('level', level);
  if (oemId) p.set('oem', oemId);
  if (categoryId) p.set('category', categoryId);
  return p.toString();
}

function renderCurrentLevel() {
  switch (navState.level) {
    case 'oems': return renderOEMsLevel();
    case 'categories': return renderCategoriesLevel();
    case 'products': return renderProductsLevel();
    default: return renderOEMsLevel();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// LEVEL 1: ALL COMPANIES (15 OEMs)
// ═════════════════════════════════════════════════════════════════════════════
function renderOEMsLevel() {
  const oems = getActiveOEMs();
  
  // Extract unique specialties from catalog matching the Excel sheet's "Speciales in" column
  const specialties = [];
  oems.forEach(oem => {
    if (oem.specialty && !specialties.includes(oem.specialty)) {
      specialties.push(oem.specialty);
    }
  });

  const isSearchActive = Boolean(navState.searchQuery && navState.searchQuery.trim());
  const matchingProducts = isSearchActive
    ? searchProducts(getAllProductsFlattened(), navState.searchQuery, navState.activeFilter)
    : [];

  return `
    <!-- Search and Specialty Filter Command Center -->
    <div class="catalog-filter-panel" id="catalog-filter-panel">
      <!-- Top Row: Unified Search Bar & Quick Specialty Selector -->
      <div class="catalog-filter-toolbar">
        <div class="catalog-search-wrap">
          <i class="fa-solid fa-magnifying-glass catalog-search-icon"></i>
          <input 
            type="text" 
            id="oem-search-input" 
            class="catalog-search-input" 
            placeholder="Search by product name, part number, category, or manufacturer..."
            value="${escapeHtml(navState.searchQuery || '')}"
            autocomplete="off"
            spellcheck="false"
          />
          <button 
            class="catalog-search-clear" 
            id="catalog-search-clear" 
            title="Clear search"
            style="display: ${isSearchActive ? 'flex' : 'none'};"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="catalog-toolbar-actions">
          <div class="catalog-select-wrap">
            <i class="fa-solid fa-sliders select-icon"></i>
            <select id="oem-specialty-select" class="catalog-specialty-select" aria-label="Filter by OEM Specialty">
              <option value="all" ${(!navState.activeFilter || navState.activeFilter === 'all') ? 'selected' : ''}>
                All Specialties (${specialties.length})
              </option>
              ${specialties.map(spec => {
                const count = oems.filter(o => o.specialty === spec).length;
                return `
                  <option value="${spec}" ${navState.activeFilter === spec ? 'selected' : ''}>
                    ${spec} (${count})
                  </option>
                `;
              }).join('')}
            </select>
            <i class="fa-solid fa-chevron-down select-arrow"></i>
          </div>

          <button 
            class="catalog-reset-filters-btn" 
            id="catalog-reset-filters-btn" 
            title="Reset active filters"
            style="display: ${(navState.activeFilter && navState.activeFilter !== 'all') || isSearchActive ? 'inline-flex' : 'none'};"
          >
            <i class="fa-solid fa-rotate-left"></i>
            <span>Reset</span>
          </button>
        </div>
      </div>

      <!-- Bottom Row: Sleek Horizontal Specialty Carousel Track -->
      <div class="catalog-chips-carousel-wrapper">
        <button class="chips-scroll-btn chips-scroll-prev" id="chips-scroll-prev" aria-label="Scroll specialties left" title="Scroll left">
          <i class="fa-solid fa-chevron-left"></i>
        </button>

        <div class="catalog-chips-track" id="catalog-chips-track">
          <button class="domain-filter-pill ${(!navState.activeFilter || navState.activeFilter === 'all') ? 'active' : ''}" data-specialty="all">
            <span class="pill-title">All Specialties</span>
            <span class="pill-badge">${specialties.length}</span>
          </button>
          ${specialties.map(spec => {
            const count = oems.filter(o => o.specialty === spec).length;
            return `
              <button class="domain-filter-pill ${navState.activeFilter === spec ? 'active' : ''}" data-specialty="${spec}" title="${spec}">
                <span class="pill-title">${spec}</span>
                <span class="pill-badge">${count}</span>
              </button>
            `;
          }).join('')}
        </div>

        <button class="chips-scroll-btn chips-scroll-next" id="chips-scroll-next" aria-label="Scroll specialties right" title="Scroll right">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
    </div>

    <!-- Active Count Display & Level Header -->
    <div class="catalog-section-meta" id="catalog-section-meta">
      <div class="catalog-level-header" id="catalog-level-header">
        <h2 class="catalog-level-title" id="catalog-level-title">
          ${isSearchActive ? 'Product Search Results' : 'Authorized Technology Manufacturers'}
        </h2>
        <p class="catalog-level-desc" id="catalog-level-desc">
          ${isSearchActive 
            ? `Found <strong>${matchingProducts.length}</strong> matching product${matchingProducts.length === 1 ? '' : 's'} for &ldquo;${escapeHtml(navState.searchQuery)}&rdquo;`
            : 'Select an OEM partner below to explore their specialized categories and product models'}
        </p>
      </div>
      <span id="visible-oem-count" style="display:none;">${isSearchActive ? matchingProducts.length : oems.length}</span>
    </div>

    <!-- Grid of OEM Cards (default view when search is empty) -->
    <div class="oem-cards-grid" id="oem-cards-grid" style="display: ${isSearchActive ? 'none' : 'grid'};">
      ${oems.map(oem => renderOEMCard(oem)).join('')}
    </div>

    <!-- Container for Product Search Results (active view when search has input) -->
    <div class="catalog-search-results-wrap" id="catalog-search-results-wrap" style="display: ${isSearchActive ? 'block' : 'none'};">
      ${isSearchActive ? renderSearchResultsGrid(matchingProducts, navState.searchQuery) : ''}
    </div>
  `;
}

function renderSearchResultsGrid(matchingProducts, query) {
  if (!matchingProducts || matchingProducts.length === 0) {
    return `
      <div class="catalog-empty-state">
        <i class="fa-solid fa-magnifying-glass"></i>
        <h3>No Matching Products</h3>
        <p>We could not find any products matching "<strong>${escapeHtml(query)}</strong>".</p>
        <p style="color:var(--text-gray-400);font-size:0.875rem;margin-top:6px;">
          Try checking for part number variations (e.g. <code>5880</code>, <code>RO4350B</code>, <code>TC350</code>), keywords, or clear the search to browse all manufacturers.
        </p>
        <button class="btn-primary" id="catalog-empty-clear-btn" style="cursor:pointer;margin-top:16px;">
          <i class="fa-solid fa-rotate-left"></i> Clear Search
        </button>
      </div>
    `;
  }

  return `
    <div class="product-cards-grid" id="product-search-cards-grid">
      ${matchingProducts.map((product, index) => {
        const oem = {
          shortName: product.oemShort || product.oemName,
          name: product.oemName,
          accentColor: product.oemAccent || '#2563EB',
          defaultImage: product.oemDefaultImage || ''
        };
        const cat = {
          name: product.categoryName || product.category || ''
        };
        return renderProductCard(product, index, oem, cat);
      }).join('')}
    </div>
  `;
}

function renderOEMCard(oem) {
  const visibleCategories = (oem.categories || []).filter(c => c.visible !== false);
  const totalProducts = visibleCategories.reduce((acc, cat) => acc + (cat.products ? cat.products.filter(p => p.visible !== false).length : 0), 0);
  const totalCategories = visibleCategories.length;
  const params = buildNavParams('categories', oem.id);

  // Standardize preview categories to maximum 2-line footprint
  let previewCats = visibleCategories.slice(0, 3);
  const totalLength = previewCats.reduce((sum, c) => sum + c.name.length, 0);
  if (totalLength > 36 && visibleCategories.length > 2) {
    previewCats = visibleCategories.slice(0, 2);
  }
  const remainingCount = visibleCategories.length - previewCats.length;

  return `
    <div class="oem-card" data-nav-params="${params}" data-oem-id="${oem.id}" data-specialty="${oem.specialty}" style="--oem-accent: ${oem.accentColor}; --oem-glow: ${oem.glowColor};">
      <div class="oem-card-accent-bar"></div>
      
      <!-- Prominent OEM Logo Header Showcase -->
      <div class="oem-card-logo-showcase" style="border-bottom: 1px solid ${oem.accentColor}25;">
        <div class="oem-card-logo-container">
          ${oem.logoImg ? `<img src="${ContentService.resolveImg(oem.logoImg)}" alt="${oem.name} Official Logo" class="oem-logo-img" loading="eager" />` : (oem.logoSvg || '')}
        </div>
      </div>

      <div class="oem-card-body">
        <div class="oem-card-title-header">
          <h3 class="oem-card-name">${oem.name}</h3>
          <div class="oem-specialty-row">
            <span class="oem-specialty-pill" style="background: ${oem.accentColor}18; color: ${oem.accentColor}; border: 1px solid ${oem.accentColor}40;">
              ${oem.specialty}
            </span>
          </div>
        </div>

        <p class="oem-card-tagline">${oem.tagline}</p>
        <p class="oem-card-desc">${oem.description}</p>

        <!-- Categories preview pills -->
        <div class="oem-card-categories-preview">
          <span class="preview-label">Categories:</span>
          <div class="preview-pills">
            ${previewCats.map(c => `<span class="preview-pill">${c.name}</span>`).join('')}
            ${remainingCount > 0 ? `<span class="preview-pill preview-pill-more">+${remainingCount} more</span>` : ''}
          </div>
        </div>

        <!-- Meta Counters -->
        <div class="oem-card-meta">
          <span class="oem-meta-badge" style="background: ${oem.accentColor}15; border-color: ${oem.accentColor}35; color: ${oem.accentColor};">
            <i class="fa-solid fa-folder-tree"></i> ${totalCategories} ${totalCategories === 1 ? 'Category' : 'Categories'}
          </span>
          <span class="oem-meta-badge" style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.12); color: #E2E8F0;">
            <i class="fa-solid fa-microchip"></i> ${totalProducts} ${totalProducts === 1 ? 'Product Line' : 'Products &amp; Lines'}
          </span>
        </div>
      </div>

      <div class="oem-card-cta" style="color: ${oem.accentColor};">
        <span>Explore Categories &amp; Products</span>
        <i class="fa-solid fa-arrow-right"></i>
      </div>
    </div>
  `;
}

// ═════════════════════════════════════════════════════════════════════════════
// LEVEL 2: CATEGORIES (When OEM is selected)
// ═════════════════════════════════════════════════════════════════════════════
function renderCategoriesLevel() {
  const oem = getActiveOEM(navState.oemId);
  if (!oem) {
    return `
      <div class="catalog-empty-state">
        <i class="fa-solid fa-circle-exclamation"></i>
        <h3>Manufacturer Not Found</h3>
        <p>The selected OEM could not be located in our catalog database.</p>
        <a class="btn-primary" data-nav-params="level=oems">Return to All Manufacturers</a>
      </div>
    `;
  }

  const categories = getActiveCategories(navState.oemId);
  const totalProducts = categories.reduce((acc, cat) => acc + (cat.products ? cat.products.filter(p => p.visible !== false).length : 0), 0);

  return `
    <!-- OEM Header Banner -->
    <div class="catalog-oem-banner" style="--oem-accent: ${oem.accentColor}; --oem-glow: ${oem.glowColor};">
      <div class="catalog-oem-banner-top">
        <div class="catalog-oem-banner-logo-box">
          ${oem.logoImg ? `<img src="${ContentService.resolveImg(oem.logoImg)}" alt="${oem.name} Official Logo" class="oem-banner-logo-img" loading="eager" />` : (oem.logoSvg || '')}
        </div>
        <div class="catalog-oem-banner-links">
          <a class="oem-back-btn" data-nav-params="level=oems">
            <i class="fa-solid fa-arrow-left"></i>
            <span>All Companies</span>
          </a>
        </div>
      </div>

      <div class="catalog-oem-banner-info">
        <div class="catalog-oem-tag-row">
          <span class="catalog-spec-badge" style="background:${oem.accentColor}20; color:${oem.accentColor}; border:1px solid ${oem.accentColor}50;">
            <i class="fa-solid fa-industry"></i>
            <span>Specialty: ${oem.specialty}</span>
          </span>
          <span class="catalog-oem-count-badge">
            <i class="fa-solid fa-box-open"></i> ${totalProducts} Products / Lines across ${categories.length} Categories
          </span>
        </div>
        <h2 class="catalog-oem-name">${oem.name}</h2>
        <p class="catalog-oem-desc">${oem.description}</p>
      </div>
    </div>

    <!-- Category Section Header -->
    <div class="catalog-section-meta" style="margin-top: 32px;">
      <div>
        <h3 class="catalog-level-title">Select a Product Category</h3>
        <p class="catalog-level-desc">Browse through ${oem.name}'s product families and click any category to view individual models and specifications.</p>
      </div>
    </div>

    <!-- Categories Grid -->
    <div class="category-cards-grid">
      ${categories.map(cat => renderCategoryCard(oem, cat)).join('')}
    </div>
  `;
}

function renderCategoryCard(oem, cat) {
  const params = buildNavParams('products', oem.id, cat.id);
  const sampleProd = cat.products[0] || {};
  const image = ContentService.resolveImg(sampleProd.image || oem.defaultImage || '/images/rf-filter.jpg');

  return `
    <div class="category-card" data-nav-params="${params}" style="--oem-accent: ${oem.accentColor};">
      <!-- Category Visual Header Preview -->
      <div class="category-card-visual">
        <img 
          src="${image}" 
          alt="${cat.name}" 
          class="category-card-img" 
          loading="lazy" 
          onerror="this.onerror=null; this.src='/images/rf-filter.jpg';" 
        />
        <div class="category-count-badge" style="background: ${oem.accentColor}; color: #ffffff;">
          ${cat.products.length} ${cat.products.length === 1 ? 'Part' : 'Parts'}
        </div>
      </div>

      <div class="category-card-content">
        <div class="category-header-row">
          <h4 class="category-name">${cat.name}</h4>
        </div>
        <p class="category-desc">${cat.description}</p>

        <!-- Product Preview List -->
        <div class="category-products-preview">
          <div class="category-preview-title">Models &amp; Variants:</div>
          ${cat.products.slice(0, 3).map(p => `
            <div class="category-prod-preview-item">
              <i class="fa-solid fa-check" style="color: ${oem.accentColor}; font-size: 0.65rem;"></i>
              <span class="preview-name">${p.name}</span>
            </div>
          `).join('')}
          ${cat.products.length > 3 ? `
            <div class="category-prod-preview-item" style="color: #94A3B8; font-style: italic;">
              <i class="fa-solid fa-ellipsis" style="color: #64748B;"></i>
              <span>+${cat.products.length - 3} more product specifications</span>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="category-cta" style="color: ${oem.accentColor};">
        <span>View All ${cat.products.length} Products</span>
        <i class="fa-solid fa-arrow-right"></i>
      </div>
    </div>
  `;
}

// ═════════════════════════════════════════════════════════════════════════════
// LEVEL 3: PRODUCTS (Visual Cards with Product Pictures + Detailed Table)
// ═════════════════════════════════════════════════════════════════════════════
function renderProductsLevel() {
  const oem = getActiveOEM(navState.oemId);
  const cat = getActiveCategory(navState.oemId, navState.categoryId);
  const products = getActiveProductsForCategory(navState.oemId, navState.categoryId);

  if (!oem || !cat) {
    return `
      <div class="catalog-empty-state">
        <i class="fa-solid fa-circle-exclamation"></i>
        <h3>Category Not Found</h3>
        <p>The requested product category could not be found.</p>
        <a class="btn-primary" data-nav-params="level=oems">Return to Catalog Home</a>
      </div>
    `;
  }

  const backToCatsParams = buildNavParams('categories', oem.id);

  return `
    <!-- Category & OEM Header Strip -->
    <div class="catalog-product-level-header" style="--oem-accent: ${oem.accentColor};">
      <div class="cpl-left">
        <div class="cpl-oem-badge-row">
          <div class="cpl-logo-inline">
            ${oem.logoImg ? `<img src="${ContentService.resolveImg(oem.logoImg)}" alt="${oem.name}" class="cpl-inline-logo-img" />` : (oem.logoSvg || '')}
          </div>
          <span class="cpl-divider">/</span>
          <span class="cpl-cat-tag">${cat.name}</span>
        </div>
        <h2 class="cpl-title">${cat.name}</h2>
        <p class="cpl-desc">${cat.description}</p>
      </div>

      <div class="cpl-actions">
        <div class="cpl-counter-pill" style="border-color:${oem.accentColor}40; color:${oem.accentColor}; background:${oem.accentColor}12;">
          <i class="fa-solid fa-boxes-stacked"></i>
          <span>${products.length} ${products.length === 1 ? 'Product Model' : 'Products &amp; Lines'}</span>
        </div>
        
        <div class="cpl-view-toggle">
          <button class="view-toggle-btn ${navState.viewMode === 'cards' ? 'active' : ''}" id="view-toggle-cards" title="Visual Cards View">
            <i class="fa-solid fa-grip"></i>
            <span>Cards</span>
          </button>
          <button class="view-toggle-btn ${navState.viewMode === 'table' ? 'active' : ''}" id="view-toggle-table" title="Data Table View">
            <i class="fa-solid fa-table-list"></i>
            <span>Table</span>
          </button>
        </div>

        <a class="cpl-back-link" data-nav-params="${backToCatsParams}">
          <i class="fa-solid fa-arrow-left"></i>
          <span>Back to Categories</span>
        </a>
      </div>
    </div>

    <!-- Main Products View: Visual Cards or Data Table -->
    ${navState.viewMode === 'cards' ? `
      <div class="product-cards-grid" id="product-cards-grid">
        ${products.map((p, i) => renderProductCard(p, i, oem, cat)).join('')}
      </div>
    ` : `
      <div class="products-table-wrap">
        <div class="products-table-header">
          <div class="ptable-col ptable-col-num">#</div>
          <div class="ptable-col ptable-col-img">Visual</div>
          <div class="ptable-col ptable-col-name">Product Name &amp; Code</div>
          <div class="ptable-col ptable-col-desc">Technical Description</div>
          <div class="ptable-col ptable-col-apps">Target Applications</div>
          <div class="ptable-col ptable-col-actions">Request RFQ</div>
        </div>
        <div class="products-table-body">
          ${products.map((p, i) => renderProductRow(p, i, oem)).join('')}
        </div>
      </div>
    `}
  `;
}

function renderProductCard(product, index, oem, cat) {
  const isValidLink = product.link && product.link.startsWith('http');
  const image = ContentService.resolveImg(product.image || oem.defaultImage || '/images/rf-filter.jpg');

  // Format applications into individual chips
  let apps = [];
  if (product.applications) {
    apps = product.applications
      .split(/[,;\n•]/)
      .map(a => a.replace(/^[0-9]+[\.\)]\s*/, '').trim())
      .filter(a => a.length > 2)
      .slice(0, 4);
  }

  return `
    <div class="product-detail-card" style="--oem-accent: ${oem.accentColor};" data-product-id="${product.id}">
      <!-- Dedicated Product Picture Banner -->
      <a href="/product/${encodeURIComponent(product.id)}" class="product-card-image-wrap" style="display:block;text-decoration:none;" title="View ${product.name} specifications">
        <img 
          src="${image}" 
          alt="${product.name}" 
          class="product-card-img" 
          loading="lazy"
          onerror="this.onerror=null; this.src='/images/rf-filter.jpg';"
        />
        <div class="product-card-img-gradient"></div>

        <!-- OEM Mini-Badge Overlay -->
        <div class="product-card-oem-overlay" style="background: rgba(10,15,30,0.85); border: 1px solid ${oem.accentColor}40;">
          <span style="color: ${oem.accentColor}; font-weight: 800; font-size: 0.72rem; letter-spacing: 0.05em;">
            ${oem.shortName}
          </span>
        </div>

        <!-- Category Pill Overlay -->
        <div class="product-card-cat-overlay">
          ${cat.name}
        </div>
      </a>

      <!-- Card Information -->
      <div class="product-card-body">
        <h4 class="product-card-name" title="${product.name}">
          <a href="/product/${encodeURIComponent(product.id)}" style="color:inherit;text-decoration:none;">${product.name}</a>
        </h4>
        
        <p class="product-card-desc">
          ${product.description}
        </p>

        <!-- Applications Tags -->
        ${apps.length ? `
          <div class="product-card-apps-section">
            <span class="product-card-apps-title">
              <i class="fa-solid fa-bullseye" style="color:${oem.accentColor};"></i> Key Applications:
            </span>
            <div class="product-card-apps-tags">
              ${apps.map(app => `
                <span class="product-app-pill" style="border-color:${oem.accentColor}30; background:${oem.accentColor}10; color:#E2E8F0;">
                  ${app}
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Card Action Buttons -->
      <div class="product-card-footer">
        <a href="/product/${encodeURIComponent(product.id)}" class="pcard-link-btn" style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.12); color: #CBD5E1;">
          <i class="fa-solid fa-microchip"></i>
          <span>View Specs</span>
        </a>
        <a href="/contact?subject=rfq&model=${encodeURIComponent(product.name)}&product=${encodeURIComponent(product.name)}&oem=${encodeURIComponent(oem.name)}" class="pcard-rfq-btn" style="background: ${oem.accentColor};">
          <span>Request RFQ</span>
        </a>
      </div>
    </div>
  `;
}

function renderProductRow(product, index, oem) {
  const isValidLink = product.link && product.link.startsWith('http');
  const image = ContentService.resolveImg(product.image || oem.defaultImage || '/images/rf-filter.jpg');

  let apps = [];
  if (product.applications) {
    apps = product.applications
      .split(/[,;\n•]/)
      .map(a => a.replace(/^[0-9]+[\.\)]\s*/, '').trim())
      .filter(a => a.length > 2)
      .slice(0, 3);
  }

  return `
    <div class="ptable-row" style="--row-index: ${index}; --oem-accent: ${oem.accentColor};">
      <div class="ptable-col ptable-col-num">
        <span class="ptable-num" style="background: ${oem.accentColor}18; color: ${oem.accentColor};">
          ${String(index + 1).padStart(2, '0')}
        </span>
      </div>
      <div class="ptable-col ptable-col-img">
        <a href="/product/${encodeURIComponent(product.id)}" style="display:block;">
          <img 
            src="${image}" 
            alt="${product.name}" 
            class="ptable-thumb" 
            loading="lazy"
            onerror="this.onerror=null; this.src='/images/rf-filter.jpg';"
          />
        </a>
      </div>
      <div class="ptable-col ptable-col-name">
        <span class="ptable-product-name">
          <a href="/product/${encodeURIComponent(product.id)}" style="color:inherit;text-decoration:none;">${product.name}</a>
        </span>
        <span class="ptable-oem-sub" style="color: ${oem.accentColor};">${oem.shortName}</span>
      </div>
      <div class="ptable-col ptable-col-desc">
        <span class="ptable-desc-text">${product.description}</span>
      </div>
      <div class="ptable-col ptable-col-apps">
        <div class="ptable-apps-wrap">
          ${apps.map(app => `<span class="ptable-app-badge">${app}</span>`).join('')}
        </div>
      </div>
      <div class="ptable-col ptable-col-actions" style="display:flex;gap:6px;">
        <a href="/product/${encodeURIComponent(product.id)}" class="ptable-action-rfq" title="View Specifications" style="background:rgba(255,255,255,0.08);color:#e2e8f0;padding:6px 10px;">
          Specs
        </a>
        <a href="/contact?subject=rfq&model=${encodeURIComponent(product.name)}&product=${encodeURIComponent(product.name)}&oem=${encodeURIComponent(oem.name)}" class="ptable-action-rfq" title="Request Quote" style="background: ${oem.accentColor};padding:6px 10px;">
          RFQ
        </a>
      </div>
    </div>
  `;
}

// ═════════════════════════════════════════════════════════════════════════════
// INTERACTIVITY & EVENT LISTENERS
// ═════════════════════════════════════════════════════════════════════════════
export function initProductsPage() {
  attachCatalogEvents();
  if (catalogLoadPromise) return;
  catalogLoadPromise = CatalogService.getPublicCatalog()
    .then(({ catalog, source }) => {
      catalogData = catalog;
      catalogNotice = source === 'api'
        ? ''
        : source === 'fallback-empty'
          ? 'The live catalog is currently empty. The existing site catalog is shown temporarily; no local records were imported.'
          : '';
      refreshCatalogPage();
    })
    .catch((error) => {
      catalogData = ContentService.getData('products') || [];
      catalogNotice = `The catalog service could not be reached. Showing the existing site catalog instead. (${error.message})`;
      refreshCatalogPage();
    })
    .finally(() => {
      catalogLoadPromise = null;
    });
}

function refreshCatalogPage() {
  const page = document.getElementById('catalog-page');
  if (!page) return;
  page.outerHTML = renderProductsPage();
  attachCatalogEvents();
}

function attachCatalogEvents() {
  const page = document.getElementById('catalog-page');
  if (!page) return;

  // Delegated click on elements with data-nav-params
  page.addEventListener('click', (e) => {
    const navBtn = e.target.closest('[data-nav-params]');
    if (navBtn) {
      e.preventDefault();
      const paramsStr = navBtn.getAttribute('data-nav-params');
      navigateTo(paramsStr);
      return;
    }

    // Specialty filter pills
    const specialtyPill = e.target.closest('.domain-filter-pill');
    if (specialtyPill) {
      const specialty = specialtyPill.getAttribute('data-specialty');
      filterOEMsBySpecialty(specialty);
      return;
    }

    // Reset filters button
    const resetBtn = e.target.closest('#catalog-reset-filters-btn');
    if (resetBtn) {
      resetAllFilters();
      return;
    }

    // Horizontal Chips Track Scroll Buttons
    const prevBtn = e.target.closest('#chips-scroll-prev');
    if (prevBtn) {
      const track = document.getElementById('catalog-chips-track');
      if (track) track.scrollBy({ left: -260, behavior: 'smooth' });
      return;
    }

    const nextBtn = e.target.closest('#chips-scroll-next');
    if (nextBtn) {
      const track = document.getElementById('catalog-chips-track');
      if (track) track.scrollBy({ left: 260, behavior: 'smooth' });
      return;
    }

    // View toggle buttons
    const cardsBtn = e.target.closest('#view-toggle-cards');
    if (cardsBtn) {
      navState.viewMode = 'cards';
      refreshProductsView();
      return;
    }

    const tableBtn = e.target.closest('#view-toggle-table');
    if (tableBtn) {
      navState.viewMode = 'table';
      refreshProductsView();
      return;
    }

    // Clear search button or empty state clear button
    const clearBtn = e.target.closest('#catalog-search-clear, #catalog-empty-clear-btn');
    if (clearBtn) {
      const input = document.getElementById('oem-search-input');
      if (input) input.value = '';
      navState.searchQuery = '';
      filterOEMsBySearch('');
      return;
    }
  });

  // Delegated change listener for Specialty Select
  page.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'oem-specialty-select') {
      filterOEMsBySpecialty(e.target.value);
    }
  });

  // Search input typing
  const searchInput = document.getElementById('oem-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      navState.searchQuery = query;
      filterOEMsBySearch(query);
    });
  }
}

function filterOEMsBySpecialty(specialty) {
  navState.activeFilter = specialty;

  // Sync Select Dropdown
  const select = document.getElementById('oem-specialty-select');
  if (select && select.value !== specialty) {
    select.value = specialty;
  }

  // Update pill active classes & center active pill
  const pills = document.querySelectorAll('.domain-filter-pill');
  pills.forEach(p => {
    if (p.getAttribute('data-specialty') === specialty) {
      p.classList.add('active');
      p.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else {
      p.classList.remove('active');
    }
  });

  applyFilters();
}

function resetAllFilters() {
  navState.activeFilter = 'all';
  navState.searchQuery = '';

  const searchInput = document.getElementById('oem-search-input');
  if (searchInput) searchInput.value = '';

  const select = document.getElementById('oem-specialty-select');
  if (select) select.value = 'all';

  const pills = document.querySelectorAll('.domain-filter-pill');
  pills.forEach(p => {
    if (p.getAttribute('data-specialty') === 'all') {
      p.classList.add('active');
      p.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else {
      p.classList.remove('active');
    }
  });

  applyFilters();
}

function filterOEMsBySearch(query) {
  navState.searchQuery = query;
  applyFilters();
}

function applyFilters() {
  const query = (navState.searchQuery || '').trim();
  const filter = navState.activeFilter || 'all';

  const oemGrid = document.getElementById('oem-cards-grid');
  const searchResultsWrap = document.getElementById('catalog-search-results-wrap');
  const levelTitle = document.getElementById('catalog-level-title');
  const levelDesc = document.getElementById('catalog-level-desc');
  const counter = document.getElementById('visible-oem-count');
  const resetBtn = document.getElementById('catalog-reset-filters-btn');
  const clearBtn = document.getElementById('catalog-search-clear');

  // Toggle Clear Button Visibility in Search Bar
  if (clearBtn) {
    clearBtn.style.display = query ? 'flex' : 'none';
  }

  // Toggle Reset Button Visibility
  if (resetBtn) {
    const isFiltered = (filter !== 'all') || Boolean(query);
    resetBtn.style.display = isFiltered ? 'inline-flex' : 'none';
  }

  // When a search query is active -> show product search results!
  if (query) {
    if (oemGrid) oemGrid.style.display = 'none';
    if (searchResultsWrap) {
      searchResultsWrap.style.display = 'block';
      const allProducts = getAllProductsFlattened();
      const matchingProducts = searchProducts(allProducts, query, filter);
      searchResultsWrap.innerHTML = renderSearchResultsGrid(matchingProducts, query);

      if (levelTitle) levelTitle.textContent = 'Product Search Results';
      if (levelDesc) {
        levelDesc.innerHTML = `Found <strong>${matchingProducts.length}</strong> matching product${matchingProducts.length === 1 ? '' : 's'} for &ldquo;${escapeHtml(query)}&rdquo;`;
      }
      if (counter) counter.textContent = matchingProducts.length;
    }
    return;
  }

  // When search query is empty -> show OEM company cards!
  if (searchResultsWrap) {
    searchResultsWrap.style.display = 'none';
    searchResultsWrap.innerHTML = '';
  }

  if (levelTitle) levelTitle.textContent = 'Authorized Technology Manufacturers';
  if (levelDesc) {
    levelDesc.textContent = 'Select an OEM partner below to explore their specialized categories and product models';
  }

  if (oemGrid) {
    oemGrid.style.display = 'grid';
    const cards = oemGrid.querySelectorAll('.oem-card');
    let visibleCount = 0;

    cards.forEach(card => {
      const cardSpecialty = card.getAttribute('data-specialty') || '';
      const matchesSpecialty = (filter === 'all') || (cardSpecialty === filter);

      if (matchesSpecialty) {
        card.classList.remove('is-hidden');
        card.style.setProperty('display', 'flex', 'important');
        visibleCount++;
      } else {
        card.classList.add('is-hidden');
        card.style.setProperty('display', 'none', 'important');
      }
    });

    if (counter) counter.textContent = visibleCount;
  }
}

function refreshProductsView() {
  const content = document.getElementById('catalog-content');
  if (content) {
    content.innerHTML = renderCurrentLevel();
  }
}

function navigateTo(paramsStr) {
  const params = new URLSearchParams(paramsStr);
  navState.level = params.get('level') || 'oems';
  navState.oemId = params.get('oem') || null;
  navState.categoryId = params.get('category') || null;
  if (navState.level !== 'oems') {
    navState.searchQuery = '';
  }

  history.replaceState(null, '', `/products?${paramsStr}`);

  // Transition content
  const content = document.getElementById('catalog-content');
  const breadcrumb = document.getElementById('catalog-breadcrumb');

  if (content) {
    content.style.opacity = '0';
    content.style.transform = 'translateY(10px)';
    setTimeout(() => {
      content.innerHTML = renderCurrentLevel();
      content.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      content.style.opacity = '1';
      content.style.transform = 'translateY(0)';
    }, 100);
  }

  if (breadcrumb) {
    breadcrumb.innerHTML = renderBreadcrumb();
  }

  // Smooth scroll to catalog view
  document.querySelector('#catalog-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
