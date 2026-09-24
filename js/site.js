/* =============================================
   js/site.js — Lumariq Homepage
   Loads ALL content from Supabase:
     - site_settings  → hero, about, contact, footer, SEO
     - services       → services grid
     - testimonials   → testimonials grid
     - projects       → featured project cards
   Depends on: supabase.js loaded before this file.
============================================= */

'use strict';

/* =============================================
   UTILITY
============================================= */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function setTextIfSet(id, val) {
  if (!val) return;          // don't wipe if DB has nothing
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setHTMLIfSet(id, html) {
  if (!html) return;
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function setAttr(selector, attr, val) {
  if (!val) return;
  const el = document.querySelector(selector);
  if (el) el[attr] = val;
}

/* =============================================
   1. SITE SETTINGS
   Updates: hero image/title/subtitle, about image/text,
   contact email, footer, social links, SEO meta tags.
============================================= */
async function loadSiteSettings() {
  // .limit(1) instead of .single() — never throws on 0 rows,
  // works with any PK type (UUID or integer)
  const { data: rows, error } = await sb
    .from('site_settings')
    .select('*')
    .limit(1);

  if (error) {
    console.error('[site.js] loadSiteSettings error:', error);
    return;
  }
  // Table is empty — HTML defaults remain, nothing to apply
  if (!rows || rows.length === 0) return;

  const s = rows[0];

  /* ── Hero image ────────────────────────── */
 if (s.hero_image_url) {
    const heroImg = document.querySelector('.hero-section img.hero-image');
    if (heroImg) {
      heroImg.src = s.hero_image_url;
      heroImg.onload = () => { heroImg.style.opacity = '1'; };
    }
  }
  /* ── Hero title ────────────────────────── */
  if (s.hero_title) {
    const heroH1 = document.querySelector('.hero h1');
    if (heroH1) {
      const words = s.hero_title.trim().split(' ');
      const last  = words.pop();
      heroH1.innerHTML = words.join(' ') + (words.length ? '<br>' : '') + `<em>${esc(last)}</em>`;
    }
  }

  /* ── Hero subtitle ─────────────────────── */
  if (s.hero_subtitle) {
    const heroPara = document.querySelector('.hero-para');
    if (heroPara) heroPara.textContent = s.hero_subtitle;
  }

  /* ── About image ───────────────────────── */
  if (s.about_image_url) {
    const aboutInner = document.querySelector('.about-image-inner');
    if (aboutInner) {
      aboutInner.style.backgroundImage    = `url('${s.about_image_url}')`;
      aboutInner.style.backgroundSize     = 'cover';
      aboutInner.style.backgroundPosition = 'center';
    }
  }

  /* ── About text ────────────────────────── */
  if (s.about_text) {
    const aboutPs = document.querySelectorAll('.about-right p');
    if (aboutPs.length) {
      const paras = s.about_text.split(/\n\n+/).filter(Boolean);
      aboutPs.forEach((p, i) => {
        if (paras[i] !== undefined) p.textContent = paras[i];
      });
    }
  }

  /* ── Contact email ─────────────────────── */
  if (s.contact_email) {
    document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
      a.href        = 'mailto:' + s.contact_email;
      a.textContent = s.contact_email;
    });
  }

  /* ── Footer tagline ────────────────────── */
  if (s.footer_tagline) {
    const footerP = document.querySelector('.footer-brand p');
    if (footerP) footerP.textContent = s.footer_tagline;
  }

  /* ── Social links ───────────────────────── */
  const socialMap = {
    social_instagram : 'instagram',
    social_linkedin  : 'LinkedIn',
    social_behance   : 'Behance',
  };
  Object.entries(socialMap).forEach(([key, label]) => {
    if (!s[key]) return;
    document.querySelectorAll('.footer-col a, .social-links a').forEach(a => {
      if (a.textContent.trim().toLowerCase() === label.toLowerCase()) {
        a.href = s[key];
      }
    });
  });

  /* ── SEO ───────────────────────────────── */
  if (s.seo_title)       document.title = s.seo_title;
  if (s.seo_description) setAttr('meta[name="description"]', 'content', s.seo_description);
}

/* =============================================
   2. SERVICES
   Replaces the entire .services-grid with DB data.
============================================= */
async function loadServices() {
  const { data, error } = await sb
    .from('services')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error || !data || !data.length) return;

  const grid = document.querySelector('.services-grid');
  if (!grid) return;

  // SVG icons — cycle through the ones already in the HTML
  const icons = [
    `<rect x="4" y="4" width="28" height="28"/><line x1="4" y1="14" x2="32" y2="14"/><line x1="14" y1="4" x2="14" y2="32"/>`,
    `<polygon points="18,3 33,28 3,28"/><line x1="18" y1="12" x2="18" y2="21"/>`,
    `<circle cx="18" cy="18" r="12"/><circle cx="18" cy="18" r="5"/><line x1="18" y1="3" x2="18" y2="8"/><line x1="18" y1="28" x2="18" y2="33"/>`,
    `<circle cx="18" cy="18" r="14"/><ellipse cx="18" cy="18" rx="6" ry="14"/><line x1="4" y1="18" x2="32" y2="18"/>`,
    `<circle cx="18" cy="12" r="7"/><path d="M4 32 C4 24 32 24 32 32"/>`,
    `<rect x="3" y="3" width="30" height="22"/><line x1="3" y1="10" x2="33" y2="10"/><circle cx="8" cy="6.5" r="1.5"/>`,
  ];

  const delayClasses = ['', 'reveal-delay-1', 'reveal-delay-2', 'reveal-delay-3', 'reveal-delay-4', 'reveal-delay-5'];

  grid.innerHTML = data.map((svc, i) => `
    <div class="service-card reveal ${delayClasses[i] || ''}">
      <span class="service-number">${i + 1}</span>
      <svg class="service-icon" viewBox="0 0 36 36" fill="none"
        stroke="rgba(248,239,229,0.5)" stroke-width="1">
        ${icons[i % icons.length]}
      </svg>
      <h3>${esc(svc.title)}</h3>
      <p>${esc(svc.description || '')}</p>
      <span class="service-arrow">→</span>
    </div>`).join('');

  // Re-observe newly added cards for scroll reveal
  grid.querySelectorAll('.reveal').forEach(el => {
    if (window._revealObserver) window._revealObserver.observe(el);
  });

  // Re-wire cursor hover
  grid.querySelectorAll('.service-card').forEach(el => addCursorHover(el));
}

/* =============================================
   3. TESTIMONIALS
   Replaces .testimonials-grid with DB data.
============================================= */
async function loadTestimonials() {
  const { data, error } = await sb
    .from('testimonials')
    .select('*')
    .order('id', { ascending: true });

  if (error || !data || !data.length) return;

  const grid = document.querySelector('.testimonials-grid');
  if (!grid) return;

  const delays = ['', 'reveal-delay-1', 'reveal-delay-2'];

  grid.innerHTML = data.map((t, i) => `
    <div class="testimonial-card reveal ${delays[i] || ''}">
      <blockquote>"${esc(t.quote)}"</blockquote>
      <div class="testimonial-author">
        <p class="author-name">${esc(t.client_name)}</p>
        <p class="author-role">${esc(t.client_role || '')}</p>
      </div>
    </div>`).join('');

  grid.querySelectorAll('.reveal').forEach(el => {
    if (window._revealObserver) window._revealObserver.observe(el);
  });
}

/* =============================================
   4. FEATURED PROJECTS
   Fills #projectsGrid with clickable cards.
============================================= */
async function loadFeaturedProjects() {
  const grid = document.getElementById('projectsGrid');
  if (!grid) return;

  const { data, error } = await sb
    .from('projects')
    .select('id, title, category, location, year, cover_image_url, slug')
    .eq('status', 'published')
    .eq('featured', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[site.js] loadFeaturedProjects:', error);
    grid.innerHTML = '';
    return;
  }

  if (!data || !data.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;padding:80px 0;text-align:center;
        font-family:'Cormorant Garamond',serif;font-style:italic;
        color:rgba(31,15,8,0.25);font-size:1rem;letter-spacing:.06em;">
        No featured projects yet.
      </div>`;
    return;
  }

  grid.innerHTML = '';

  const delayClasses = ['', 'reveal-delay-1', 'reveal-delay-2', 'reveal-delay-3'];

  data.forEach((project, index) => {
    const delay = delayClasses[index] || '';

    const bgStyle = project.cover_image_url
      ? `background-image:url('${esc(project.cover_image_url)}');background-size:cover;background-position:center;`
      : `background:linear-gradient(135deg,#1a0d07 0%,#2f1b0e 40%,#0d0806 100%);`;

    const meta = [project.category, project.location, project.year].filter(Boolean).join(' · ');

    // A button, not a link — clicking opens the gallery popup on this
    // same page instead of navigating away.
    const card        = document.createElement('button');
    card.type          = 'button';
    card.className    = `project-card reveal ${delay}`.trim();
    card.style.cssText = 'text-decoration:none;color:inherit;display:block;width:100%;text-align:left;background:none;border:none;padding:0;font:inherit;';

    card.innerHTML = `
      <div class="project-image">
        <div class="project-bg" style="${bgStyle}"></div>
        <div class="project-overlay"></div>
        <div class="project-info">
          <p class="project-category">${esc(meta)}</p>
          <h3 class="project-title">${esc(project.title)}</h3>
        </div>
      </div>`;

    card.addEventListener('click', () => openProjectGallery(project.id, project.title));

    grid.appendChild(card);

    // Scroll reveal
    if (window._revealObserver) window._revealObserver.observe(card);

    // Cursor hover
    addCursorHover(card);
  });
}

/* =============================================
   CURSOR HOVER HELPER
============================================= */
function addCursorHover(el) {
  const cur = document.getElementById('cursor');
  const fol = document.getElementById('cursorFollower');
  el.addEventListener('mouseenter', () => { cur?.classList.add('hover'); fol?.classList.add('hover'); });
  el.addEventListener('mouseleave', () => { cur?.classList.remove('hover'); fol?.classList.remove('hover'); });
}

/* =============================================
   BOOT — run all loaders in parallel
============================================= */
/* =============================================
   PROJECT GALLERY POPUP
   Opened from a Work card — shows that project's
   photos in a grid, right here on the homepage.
============================================= */
let galleryPrevOverflow = '';

async function openProjectGallery(projectId, title) {
  const modal = document.getElementById('galleryModal');
  const grid  = document.getElementById('galleryModalGrid');
  const titleEl = document.getElementById('galleryModalTitle');
  if (!modal || !grid) return;

  titleEl.textContent = title || '';
  grid.innerHTML = '<div class="gallery-modal-empty">Loading…</div>';
  galleryPrevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  modal.classList.add('open');

  try {
    const [{ data: project }, { data: images }] = await Promise.all([
      sb.from('projects').select('cover_image_url').eq('id', projectId).single(),
      sb.from('project_images').select('image_url').eq('project_id', projectId).order('sort_order', { ascending: true }),
    ]);

    const urls = [];
    if (project?.cover_image_url) urls.push(project.cover_image_url);
    (images || []).forEach(img => {
      if (img.image_url && !urls.includes(img.image_url)) urls.push(img.image_url);
    });

    grid.innerHTML = urls.length
      ? urls.map(u => `<img src="${esc(u)}" alt="" loading="lazy">`).join('')
      : '<div class="gallery-modal-empty">No images yet for this project.</div>';
  } catch (e) {
    console.error('[site.js] openProjectGallery:', e);
    grid.innerHTML = '<div class="gallery-modal-empty">Couldn\'t load images.</div>';
  }
}

function closeProjectGallery() {
  const modal = document.getElementById('galleryModal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = galleryPrevOverflow;
}

window.openProjectGallery  = openProjectGallery;
window.closeProjectGallery = closeProjectGallery;

async function bootSite() {
  // Expose the IntersectionObserver so dynamic content can use it
  window._revealObserver = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  // Observe existing static .reveal elements
  document.querySelectorAll('.reveal').forEach(el => window._revealObserver.observe(el));

  // Load everything in parallel — fastest possible paint
  await Promise.allSettled([
    loadSiteSettings(),
    loadServices(),
    loadTestimonials(),
    loadFeaturedProjects(),
  ]);
}

bootSite();