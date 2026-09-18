/* =============================================
   js/project.js — Lumariq Project Detail Page
   Reads ?id= from URL, fetches project + images
   from Supabase, builds gallery + lightbox.
   Depends on: supabase.js loaded before this.
============================================= */

'use strict';

/* =============================================
   STATE
============================================= */
let galleryImages = [];   // all images for this project
let lbIndex       = 0;    // current lightbox index

/* =============================================
   UTILITY
============================================= */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function $(id) { return document.getElementById(id); }

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = val || '—';
}

function setHTML(id, val) {
  const el = $(id);
  if (el) el.innerHTML = val || '';
}

/* =============================================
   BOOT — read ?id= and load everything
============================================= */
async function init() {
  // ── Get project id from URL ───────────────
  const params    = new URLSearchParams(window.location.search);
  const projectId = params.get('id');

  if (!projectId) {
    showError('No project specified.');
    return;
  }

  // ── Fetch project row ─────────────────────
  const { data: project, error: pErr } = await sb
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (pErr || !project) {
    showError('Project not found.');
    return;
  }

  // ── Fetch ALL images for this project ─────
  const { data: images } = await sb
    .from('project_images')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });

  // Build full image list:
  // cover first (if not already in project_images), then rest
  galleryImages = buildImageList(project, images || []);

  // ── Render everything ─────────────────────
  renderHero(project);
  renderInfoStrip(project);
  renderGallery();
  renderDescription(project);
  updatePageMeta(project);
  bootUI();
}

/* =============================================
   BUILD IMAGE LIST
   Merges cover_image_url + project_images rows,
   deduplicates, cover always first.
============================================= */
function buildImageList(project, images) {
  const list = [...images];

  // If cover_image_url exists but isn't already in project_images, prepend it
  if (project.cover_image_url) {
    const alreadyIn = list.some(img => img.image_url === project.cover_image_url);
    if (!alreadyIn) {
      list.unshift({
        id        : 'cover',
        url       : project.cover_image_url,
        is_cover  : true,
        sort_order: -1,
      });
    } else {
      // Move it to front
      const idx = list.findIndex(img => img.url === project.cover_image_url);
      if (idx > 0) {
        const [cover] = list.splice(idx, 1);
        cover.is_cover = true;
        list.unshift(cover);
      }
    }
  }

  return list;
}

/* =============================================
   HERO
============================================= */
function renderHero(p) {
  // Background cover image
  const heroBg  = $('heroBg');
  const coverImg = $('heroCoverImg');
  if (p.cover_image_url && coverImg && heroBg) {
    coverImg.src   = p.cover_image_url;
    coverImg.style.display = 'block';
    coverImg.onload = () => heroBg.classList.add('loaded');
  }

  // Title
  const titleEl = $('heroTitle');
  if (titleEl) {
    // Split last word and italicise it
    const words = (p.title || '').trim().split(' ');
    if (words.length > 1) {
      const last  = words.pop();
      titleEl.innerHTML = words.join(' ') + ' <em>' + esc(last) + '</em>';
    } else {
      titleEl.textContent = p.title || '';
    }
  }

  // Meta row
  setText('heroCategory', p.category || '');
  setText('heroLocation',  p.location  || '');
  setText('heroYear',      p.year      || '');

  // Hide dividers if fields are empty
  if (!p.location)  { const d = $('heroDivider2'); if (d) d.style.display = 'none'; }

  // Description snippet in hero
  const descEl = $('heroDesc');
  if (descEl && p.description) {
    // Show first sentence only in hero
    const firstSentence = p.description.split(/[.!?]/)[0].trim();
    descEl.textContent  = firstSentence ? firstSentence + '.' : '';
  }

  // Page title
  document.title = p.title ? `${p.title} — Lumariq` : 'Lumariq';
}

/* =============================================
   INFO STRIP
============================================= */
function renderInfoStrip(p) {
  setText('infoClient',   p.client   || 'Private Client');
  setText('infoCategory', p.category || '—');
  setText('infoLocation', p.location || '—');
  setText('infoYear',     p.year     || '—');
}

/* =============================================
   GALLERY — masonry + feature rows
============================================= */
function renderGallery() {
  const container = $('galleryContainer');
  if (!container) return;

  if (!galleryImages.length) {
    container.innerHTML = `
      <div style="padding:80px;text-align:center;
        font-family:'Cormorant Garamond',serif;font-style:italic;
        color:rgba(248,239,229,.25);font-size:1rem;">
        No gallery images for this project.
      </div>`;
    return;
  }

  // Update count label
  const countEl = $('galleryCount');
  if (countEl) countEl.textContent = galleryImages.length + ' image' + (galleryImages.length === 1 ? '' : 's');

  container.innerHTML = '';

  /*
    Layout strategy:
    - Every 4th image (0-indexed: 3, 7, 11…) becomes a full-width "feature" row
    - All others go into a 3-column masonry grid
    - Masonry columns flush to feature breaks
  */

  let masonryBuf = [];   // buffer of images for current masonry block

  const flushMasonry = () => {
    if (!masonryBuf.length) return;
    const grid = document.createElement('div');
    grid.className = 'gallery-masonry';
    masonryBuf.forEach((img, localIdx) => {
      grid.appendChild( buildMasonryItem(img, /* global idx */ img._globalIdx) );
    });
    container.appendChild(grid);
    masonryBuf = [];
  };

  galleryImages.forEach((img, idx) => {
    img._globalIdx = idx;

    // Every 4th image (after at least 3 masonry) → feature row
    if (idx > 0 && idx % 4 === 3) {
      flushMasonry();
      container.appendChild( buildFeatureItem(img, idx) );
    } else {
      masonryBuf.push(img);
    }
  });

  // Flush remaining masonry items
  flushMasonry();
}

function buildMasonryItem(img, idx) {
  const item = document.createElement('div');
  item.className = 'gallery-item';

  item.innerHTML = `
    <img src="${esc(img.url)}" alt="Gallery image ${idx + 1}" loading="lazy">
    <div class="gallery-item-overlay">
      <span class="gallery-item-num">${String(idx + 1).padStart(2, '0')}</span>
    </div>
    <div class="gallery-item-expand">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
      </svg>
    </div>`;

  // Lazy load fade-in
  const imgEl = item.querySelector('img');
  imgEl.addEventListener('load',  () => imgEl.classList.add('loaded'));
  imgEl.addEventListener('error', () => { item.style.display = 'none'; });

  item.addEventListener('click', () => openLightbox(idx));
  return item;
}

function buildFeatureItem(img, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'gallery-feature';

  wrap.innerHTML = `
    <img src="${esc(img.url)}" alt="Gallery image ${idx + 1}" loading="lazy">
    <div class="gallery-feature-overlay"></div>
    <div class="gallery-feature-label">
      <span>${String(idx + 1).padStart(2, '0')} / ${String(galleryImages.length).padStart(2, '0')}</span>
      <span>Click to expand</span>
    </div>`;

  const imgEl = wrap.querySelector('img');
  imgEl.addEventListener('load',  () => imgEl.classList.add('loaded'));
  imgEl.addEventListener('error', () => { wrap.style.display = 'none'; });

  wrap.addEventListener('click', () => openLightbox(idx));
  return wrap;
}

/* =============================================
   DESCRIPTION SECTION
============================================= */
function renderDescription(p) {
  if (!p.description) return;

  const section = $('projectDescSection');
  const body    = $('projectDescription');
  if (section) section.style.display = 'grid';
  if (body)    body.textContent = p.description;
}

/* =============================================
   PAGE META
============================================= */
function updatePageMeta(p) {
  // <title>
  document.title = p.title ? `${p.title} — Lumariq` : 'Lumariq';

  // OG / meta description
  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    metaDesc = document.createElement('meta');
    metaDesc.name = 'description';
    document.head.appendChild(metaDesc);
  }
  metaDesc.content = p.description
    ? p.description.slice(0, 155)
    : `${p.title} — Interior Design & Visualization by Lumariq`;
}

/* =============================================
   LIGHTBOX
============================================= */
function openLightbox(startIndex) {
  lbIndex = startIndex;
  const lb = $('lightbox');
  if (!lb) return;

  buildThumbs();
  setLightboxImage(lbIndex);
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lb = $('lightbox');
  if (!lb) return;
  lb.classList.remove('open');
  document.body.style.overflow = '';
}

function setLightboxImage(idx) {
  if (!galleryImages.length) return;
  lbIndex = (idx + galleryImages.length) % galleryImages.length;

  const img     = galleryImages[lbIndex];
  const lbImg   = $('lbImg');
  const counter = $('lbCounter');

  if (lbImg) {
    // Fade transition
    lbImg.style.opacity = '0';
    lbImg.style.transform = 'scale(0.97)';
    setTimeout(() => {
      lbImg.src = img.url;
      lbImg.onload = () => {
        lbImg.style.opacity    = '1';
        lbImg.style.transform  = 'scale(1)';
      };
    }, 150);
    lbImg.style.transition = 'opacity .25s ease, transform .25s ease';
  }

  if (counter) counter.textContent = `${lbIndex + 1} / ${galleryImages.length}`;

  // Sync thumbnail active state
  document.querySelectorAll('.lb-thumb').forEach((t, i) => {
    t.classList.toggle('active', i === lbIndex);
  });

  // Scroll active thumb into view
  const activeTh = document.querySelector('.lb-thumb.active');
  if (activeTh) activeTh.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function buildThumbs() {
  const strip = $('lbThumbs');
  if (!strip) return;
  strip.innerHTML = '';

  galleryImages.forEach((img, i) => {
    const th   = document.createElement('img');
    th.className = 'lb-thumb';
    th.src       = img.url;
    th.alt       = '';
    th.loading   = 'lazy';
    th.addEventListener('click', () => setLightboxImage(i));
    strip.appendChild(th);
  });
}

/* ── Lightbox event listeners ─────────────── */
function wireLightbox() {
  $('lbClose')?.addEventListener('click', closeLightbox);
  $('lbPrev')?.addEventListener('click',  () => setLightboxImage(lbIndex - 1));
  $('lbNext')?.addEventListener('click',  () => setLightboxImage(lbIndex + 1));

  // Click backdrop to close
  $('lightbox')?.addEventListener('click', e => {
    if (e.target === $('lightbox')) closeLightbox();
  });

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    const lb = $('lightbox');
    if (!lb?.classList.contains('open')) return;
    if (e.key === 'ArrowRight') setLightboxImage(lbIndex + 1);
    if (e.key === 'ArrowLeft')  setLightboxImage(lbIndex - 1);
    if (e.key === 'Escape')     closeLightbox();
  });

  // Touch swipe support
  let touchStartX = 0;
  $('lightbox')?.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  $('lightbox')?.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      diff > 0 ? setLightboxImage(lbIndex + 1) : setLightboxImage(lbIndex - 1);
    }
  }, { passive: true });
}

/* =============================================
   UI — cursor, nav scroll, scroll reveal
============================================= */
function bootUI() {
  // Custom cursor (desktop only)
  const cursor   = $('cursor');
  const follower = $('cursorFollower');
  const isDesktopCursor = window.matchMedia('(min-width: 901px) and (hover: hover) and (pointer: fine)');
  let mx = 0, my = 0, fx = 0, fy = 0;

  document.addEventListener('mousemove', e => {
    if (!isDesktopCursor.matches) return;
    mx = e.clientX; my = e.clientY;
    if (cursor) { cursor.style.left = mx + 'px'; cursor.style.top = my + 'px'; }
  });

  (function loop() {
    if (isDesktopCursor.matches) {
      fx += (mx - fx) * 0.1;
      fy += (my - fy) * 0.1;
      if (follower) { follower.style.left = fx + 'px'; follower.style.top = fy + 'px'; }
    }
    requestAnimationFrame(loop);
  })();

  function addHover(els) {
    els.forEach(el => {
      el.addEventListener('mouseenter', () => {
        if (!isDesktopCursor.matches) return;
        cursor?.classList.add('hover');
        follower?.classList.add('hover');
      });
      el.addEventListener('mouseleave', () => {
        cursor?.classList.remove('hover');
        follower?.classList.remove('hover');
      });
    });
  }

  addHover(document.querySelectorAll('a, button, .gallery-item, .gallery-feature, .lb-btn, .lb-close, .lb-thumb'));

  // Nav scroll
  const nav = $('mainNav');
  window.addEventListener('scroll', () => {
    nav?.classList.toggle('scrolled', window.scrollY > 60);
  });

  // Scroll reveal
  const revealObs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));

  // Wire lightbox
  wireLightbox();
}

/* =============================================
   ERROR STATE
============================================= */
function showError(msg) {
  const hero = $('projectHero');
  if (hero) {
    hero.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;
        min-height:100vh;flex-direction:column;gap:16px;padding:40px;">
        <p style="font-family:'Cormorant Garamond',serif;font-style:italic;
          color:rgba(248,239,229,.4);font-size:1.1rem;">${esc(msg)}</p>
        <a href="index.html" style="font-size:.65rem;letter-spacing:.2em;
          text-transform:uppercase;color:var(--taupe);text-decoration:none;">
          ← Back to Projects
        </a>
      </div>`;
  }
}

/* =============================================
   START
============================================= */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}