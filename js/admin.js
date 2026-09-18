/* =============================================
   js/admin.js — Lumariq CMS
   Full admin dashboard logic.
   Depends on: supabase.js (loaded before this file)
   Vanilla JS only. No frameworks.
============================================= */
'use strict';

function logError(where, error) {
    console.error(where);
    console.error(error);
    console.error(JSON.stringify(error, null, 2));

    if (error?.message) {
        alert(error.message);
    } else {
        alert(JSON.stringify(error, null, 2));
    }
}
function generateSlug(text) {
    return String(text || "")
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

/* =============================================
   STATE
============================================= */
let currentUser      = null;
let allProjects      = [];          // cached project list for the projects panel
let editingImages    = [];          // [{id, url, path, is_cover, sort_order}] for open modal
let editingProjectId = null;        // null = new project, string = edit mode

/* =============================================
   TOAST NOTIFICATIONS
============================================= */
/**
 * Show a toast notification.
 * @param {string} msg
 * @param {'info'|'success'|'error'|'warn'} type
 * @param {number} duration  ms before auto-dismiss
 */
function toast(msg, type = 'info', duration = 3800) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const div       = document.createElement('div');
  div.className   = `toast ${type}`;
  div.textContent = msg;
  container.appendChild(div);

  setTimeout(() => {
    div.classList.add('out');
    div.addEventListener('animationend', () => div.remove(), { once: true });
  }, duration);
}

/* =============================================
   MODAL HELPERS
============================================= */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

/**
 * Show a confirm dialog before a destructive action.
 * @param {string}   htmlMessage  Inner HTML for the dialog body
 * @param {Function} onConfirm    Called when the user confirms
 */
function showConfirm(htmlMessage, onConfirm) {
  document.getElementById('confirmModalBody').innerHTML = htmlMessage;
  openModal('confirmModal');

  // Swap out the button to remove any stale listener
  const oldBtn  = document.getElementById('confirmModalConfirm');
  const newBtn  = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(newBtn, oldBtn);

  newBtn.addEventListener('click', () => {
    closeModal('confirmModal');
    onConfirm();
  }, { once: true });
}

/* =============================================
   PANEL NAVIGATION
============================================= */
const PANEL_TITLES = {
  dashboard    : 'Dashboard',
  projects     : 'Projects',
  services     : 'Services',
  testimonials : 'Testimonials',
  settings     : 'Site Settings',
};

/**
 * Switch the visible content panel and load its data.
 * @param {string} name  Panel key (matches data-panel attribute and #panel-{name} id)
 */
function showPanel(name) {
  // Hide all panels
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  // Deactivate all sidebar links
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  const panel = document.getElementById(`panel-${name}`);
  if (panel) panel.classList.add('active');

  document.querySelectorAll(`[data-panel="${name}"]`).forEach(l => l.classList.add('active'));

  const titleEl = document.getElementById('topbarTitle');
  if (titleEl) titleEl.textContent = PANEL_TITLES[name] || name;

  // Load fresh data for the activated panel
  if (name === 'dashboard')    loadDashboard();
  if (name === 'projects')     loadProjects();
  if (name === 'services')     loadServices();
  if (name === 'testimonials') loadTestimonials();
  if (name === 'settings')     loadSettings();

  // Auto-close sidebar on mobile after navigation
  if (window.innerWidth <= 900) {
    document.getElementById('sidebar')?.classList.remove('open');
  }
}

/* =============================================
   ESCAPE HTML UTILITY
============================================= */
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* =============================================
   DASHBOARD
============================================= */
async function loadDashboard() {
  try {
    const [
      { count: total },
      { count: published },
      { count: featured },
      { count: testimonials },
      { count: services },
      { data: recent },
    ] = await Promise.all([
      sb.from('projects').select('*', { count: 'exact', head: true }),
      sb.from('projects').select('*', { count: 'exact', head: true }).eq('status', 'published'),
      sb.from('projects').select('*', { count: 'exact', head: true }).eq('featured', true),
      sb.from('testimonials').select('*', { count: 'exact', head: true }),
      sb.from('services').select('*', { count: 'exact', head: true }),
      sb.from('projects')
        .select('id,title,slug,status,featured,category,year,cover_image_url,created_at')
        .order('created_at', { ascending: false })
        .limit(6),
    ]);

    setText('stat-total',        total        ?? 0);
    setText('stat-published',    published    ?? 0);
    setText('stat-featured',     featured     ?? 0);
    setText('stat-testimonials', testimonials ?? 0);
    setText('stat-services',     services     ?? 0);

    // Render recent projects mini-table inside the dashboard panel
    const wrap = document.getElementById('dash-recent-wrap');
    if (wrap) {
      wrap.innerHTML = renderProjectsTable(recent || []);
      attachTableActions(wrap);
    }
  } catch (e) {
    logError('loadDashboard', e);
    toast('Failed to load dashboard data', 'error');
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* =============================================
   PROJECTS — LIST
============================================= */
async function loadProjects() {
  const tbody = document.getElementById('projectsTableBody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7">
      <div class="empty-state"><div class="spinner"></div></div>
    </td></tr>`;
  }

  try {
    const { data, error } = await sb
      .from('projects')
      .select('id,title,slug,category,year,status,featured,cover_image_url,created_at,sort_order')
      .order('created_at', { ascending: false });

    if (error) throw error;
    allProjects = data || [];
    renderFilteredProjects();
  } catch (e) {
    logError('loadProjects', e);
    toast('Failed to load projects', 'error');
  }
}

/** Apply search / category / status / sort filters to allProjects and repaint the table. */
function renderFilteredProjects() {
  const search = (document.getElementById('projectSearch')?.value  || '').toLowerCase().trim();
  const cat    =  document.getElementById('projectCatFilter')?.value || '';
  const status =  document.getElementById('projectStatusFilter')?.value || '';
  const sort   =  document.getElementById('projectSort')?.value || 'created_at_desc';

  let list = [...allProjects];

  // Filter
  if (search) {
    list = list.filter(p =>
      (p.title      || '').toLowerCase().includes(search) ||
      (p.slug       || '').toLowerCase().includes(search) ||
      (p.category   || '').toLowerCase().includes(search)
    );
  }
  if (cat)    list = list.filter(p => p.category === cat);
  if (status) list = list.filter(p => p.status   === status);

  // Sort
  list.sort((a, b) => {
    switch (sort) {
      case 'title_asc':       return (a.title || '').localeCompare(b.title || '');
      case 'created_at_asc':  return new Date(a.created_at) - new Date(b.created_at);
      case 'sort_order_asc':  return (a.sort_order || 0) - (b.sort_order || 0);
      default:                return new Date(b.created_at) - new Date(a.created_at);
    }
  });

  const tbody = document.getElementById('projectsTableBody');
  if (tbody) {
    tbody.innerHTML = renderProjectRows(list);
    attachTableActions(document.getElementById('panel-projects'));
  }
}

/* ── Table markup helpers ─────────────────────── */

function renderProjectsTable(projects) {
  return `
    <table class="projects-table">
      <thead>
        <tr>
          <th style="width:56px"></th>
          <th>Title</th>
          <th>Category</th>
          <th>Year</th>
          <th>Status</th>
          <th>Featured</th>
          <th style="width:160px">Actions</th>
        </tr>
      </thead>
      <tbody>${renderProjectRows(projects)}</tbody>
    </table>`;
}

function renderProjectRows(projects) {
  if (!projects.length) {
    return `<tr><td colspan="7">
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <rect x="3" y="3" width="18" height="14" rx="1"/>
          <path d="M8 21h8M12 17v4"/>
        </svg>
        <p>No projects yet — create your first one</p>
      </div>
    </td></tr>`;
  }
  return projects.map(p => `
    <tr>
      <td>
        ${p.cover_image_url
          ? `<img class="thumb" src="${escHtml(p.cover_image_url)}" alt="" loading="lazy">`
          : `<div class="thumb-placeholder">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                 <rect x="3" y="3" width="18" height="14" rx="1"/>
               </svg>
             </div>`
        }
      </td>
      <td class="title-cell">
        <span class="project-name" title="${escHtml(p.title)}">${escHtml(p.title)}</span>
        <span class="project-slug">${escHtml(p.slug || '')}</span>
      </td>
      <td>${escHtml(p.category || '—')}</td>
      <td>${p.year || '—'}</td>
      <td>
        <span class="badge ${p.status === 'published' ? 'badge-published' : 'badge-draft'}">
          <span class="badge-dot"></span>
          ${escHtml(p.status || 'draft')}
        </span>
      </td>
      <td>
        ${p.featured
          ? `<span class="badge badge-featured">★ featured</span>`
          : `<span style="color:var(--taupe);opacity:0.35;font-size:0.7rem;">—</span>`
        }
      </td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" title="Edit"
            data-action="edit" data-id="${p.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="icon-btn" title="Duplicate"
            data-action="duplicate" data-id="${p.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          </button>
          <button class="icon-btn"
            title="${p.status === 'published' ? 'Unpublish' : 'Publish'}"
            data-action="toggle-publish"
            data-id="${p.id}"
            data-status="${escHtml(p.status || 'draft')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              ${p.status === 'published'
                ? `<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/>`
                : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
              }
            </svg>
          </button>
          <button class="icon-btn danger" title="Delete"
            data-action="delete"
            data-id="${p.id}"
            data-title="${escHtml(p.title)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

/**
 * Wire up data-action buttons inside a given container element.
 * Safe to call multiple times — it replaces the element clone so listeners don't stack.
 * @param {HTMLElement} container
 */
function attachTableActions(container) {
  if (!container) return;
  container.querySelectorAll('[data-action]').forEach(btn => {
    // Clone to avoid duplicate listeners on re-renders
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);

    fresh.addEventListener('click', () => {
      const { action, id, status, title } = fresh.dataset;
      if (action === 'edit')           openProjectModal(id);
      if (action === 'duplicate')      duplicateProject(id);
      if (action === 'toggle-publish') togglePublish(id, status);
      if (action === 'delete')         confirmDeleteProject(id, title);
    });
  });
}

/* ── Filter/sort event wiring ─────────────────── */
function wireProjectFilters() {
  ['projectSearch', 'projectCatFilter', 'projectStatusFilter', 'projectSort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderFilteredProjects);
  });
}

/* =============================================
   PROJECT MODAL — OPEN / RESET
============================================= */
async function openProjectModal(projectId = null) {
  editingProjectId = projectId;
  editingImages    = [];

  resetProjectForm();

  const titleEl = document.getElementById('projectModalTitle');
  if (titleEl) titleEl.textContent = projectId ? 'Edit Project' : 'New Project';

  if (projectId) {
    // Fetch project row
    const { data: p, error } = await sb
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) {
      toast('Failed to load project', 'error');
      logError('openProjectModal', error);
      return;
    }

    setVal('projectId',     p.id);
    setVal('pTitle',        p.title        || '');
    setVal('pSlug',         p.slug         || '');
    setVal('pCategory',     p.category     || '');
    setVal('pLocation',     p.location     || '');
    setVal('pYear',         p.year         || '');
    setVal('pClient',       p.client       || '');
    setVal('pDescription',  p.description  || '');
    setVal('pVideo',        p.video_url    || '');
    setVal('pSortOrder',    p.sort_order   ?? 0);

    setChecked('pPublished', p.status === 'published');
    setChecked('pFeatured',  p.featured || false);

    // Load gallery images
    const { data: imgs } = await sb
      .from('project_images')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    editingImages = imgs || [];
    renderGallery();
  }

  openModal('projectModal');
}

function resetProjectForm() {
  const form = document.getElementById('projectForm');
  if (form) form.reset();
  setVal('projectId', '');
  const slugField = document.getElementById('pSlug');
  if (slugField) delete slugField.dataset.manual;
  editingImages = [];
  clearEl('galleryGrid');
  clearEl('uploadProgressList');
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function setChecked(id, bool) {
  const el = document.getElementById(id);
  if (el) el.checked = bool;
}

function clearEl(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = '';
}

/* =============================================
   PROJECT MODAL — SAVE
============================================= */
async function saveProject() {
  const btn = document.getElementById('saveProjectBtn');
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Saving…';

  try {
    const title = (document.getElementById('pTitle')?.value || '').trim();
    if (!title) {
      toast('Title is required', 'warn');
      return;
    }

    const slugRaw = (document.getElementById('pSlug')?.value || '').trim();
    const slug    = slugRaw || generateSlug(title);

    const payload = {
      title,
      slug,
      category    : document.getElementById('pCategory')?.value     || null,
      location    : (document.getElementById('pLocation')?.value    || '').trim() || null,
      year        : parseInt(document.getElementById('pYear')?.value)    || null,
      client      : (document.getElementById('pClient')?.value      || '').trim() || null,
      description : (document.getElementById('pDescription')?.value || '').trim() || null,
      video_url   : (document.getElementById('pVideo')?.value       || '').trim() || null,
      sort_order  : parseInt(document.getElementById('pSortOrder')?.value) || 0,
      status      : document.getElementById('pPublished')?.checked ? 'published' : 'draft',
      featured    : document.getElementById('pFeatured')?.checked || false,
      cover_image_url: editingImages.find(i => i.is_cover)?.url
                    || editingImages[0]?.url
                    || null,
    };

    let projectId = editingProjectId;

    if (projectId) {
      // UPDATE
      const { error } = await sb.from('projects').update(payload).eq('id', projectId);
      if (error) throw error;
    } else {
      // INSERT
      const { data, error } = await sb.from('projects').insert(payload).select('id').single();
      if (error) throw error;
      projectId = data.id;
    }

    // Save newly uploaded images (no DB id yet)
    const newImages = editingImages.filter(i => !i.id);

if (newImages.length) {
  const { error: imgErr } = await sb.from('project_images').insert(
  newImages.map((img, idx) => ({
    project_id: projectId,
    image_url: img.url,
    sort_order: img.sort_order ?? idx,
  }))
);

  if (imgErr) {
    console.error("project_images insert failed:", imgErr);
    throw imgErr;
  }

  // cover_image_url already set correctly in payload above via editingImages.find(is_cover)
}
    // Update sort_order + is_cover for existing DB images
    const existingImages = editingImages.filter(i => i.id);
    for (const img of existingImages) {
      await sb.from('project_images')
       .update({
    sort_order: img.sort_order
})
        .eq('id', img.id);
    }

    toast(editingProjectId ? 'Project updated' : 'Project created', 'success');
    closeModal('projectModal');
    loadProjects();
    loadDashboard();

  } catch (e) {
    logError('saveProject', e);
    toast('Failed to save: ' + (e.message || 'unknown error'), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Save Project`;
  }
}

/* =============================================
   IMAGE UPLOAD
============================================= */

/** Handle one or more File objects dropped or picked. */
async function handleFiles(files) {
  const imageFiles = [...files].filter(file => file.type.startsWith("image/"));

  if (!imageFiles.length) {
    toast("Please select image files only", "warn");
    return;
  }

  for (const file of imageFiles) {

    toast(`Uploading ${file.name}...`, "info");

    try {

      const folder = editingProjectId
        ? `gallery/${editingProjectId}`
        : `gallery/temp`;

      const { path, publicUrl } = await uploadFile(file, folder);

      editingImages.push({
        id: null,
        url: publicUrl,
        path: path,
        sort_order: editingImages.length
      });

      renderGallery();

      toast(`${file.name} uploaded`, "success");

    } catch (err) {
      console.error(err);
      toast(`Upload failed: ${file.name}`, "error");
    }
  }
}
/** Create an animated progress row in the upload list. Returns {wrap, fill}. */
function createProgressItem(filename) {
  const wrap       = document.createElement('div');
  wrap.className   = 'upload-item';
  wrap.innerHTML   = `
    <div class="upload-item-name">
      <span>${escHtml(filename)}</span>
      <span class="pct-label">0%</span>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-bar-fill" style="width:0%"></div>
    </div>`;

  const fill    = wrap.querySelector('.progress-bar-fill');
  const pctLbl  = wrap.querySelector('.pct-label');

  // Patch fill so callers can also update the label
  const origSetter = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'width').set;
  // Simpler: override via a wrapper object
  const fillProxy = {
    set width(val) {
      fill.style.width = val;
      pctLbl.textContent = val;
    }
  };

  document.getElementById('uploadProgressList')?.appendChild(wrap);
  return { wrap, fill: fillProxy };
}

/* ── Gallery rendering ──────────────────────── */

function renderGallery() {
  const grid = document.getElementById('galleryGrid');
  if (!grid) return;
  grid.innerHTML = '';

  editingImages.forEach((img, idx) => {
    const item       = document.createElement('div');
    item.className   = 'gallery-item' + (img.is_cover ? ' cover-img' : '');
    item.draggable   = true;
    item.dataset.idx = idx;

    item.innerHTML = `
      ${img.is_cover ? `<span class="gallery-cover-badge">Cover</span>` : ''}
      <img src="${escHtml(img.url)}" alt="" loading="lazy">
      <div class="gallery-item-actions">
        <button class="icon-btn" title="Set as cover" data-set-cover="${idx}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
        <button class="icon-btn danger" title="Remove image" data-remove-img="${idx}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          </svg>
        </button>
      </div>
      <div class="drag-handle" title="Drag to reorder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="8"  y1="6"  x2="21" y2="6"/>
          <line x1="8"  y1="12" x2="21" y2="12"/>
          <line x1="8"  y1="18" x2="21" y2="18"/>
          <line x1="3"  y1="6"  x2="3.01" y2="6"/>
          <line x1="3"  y1="12" x2="3.01" y2="12"/>
          <line x1="3"  y1="18" x2="3.01" y2="18"/>
        </svg>
      </div>`;

    // Set as cover
    item.querySelector('[data-set-cover]').addEventListener('click', e => {
      e.stopPropagation();
      editingImages.forEach((im, k) => { im.is_cover = (k === idx); });
      renderGallery();
    });

    // Remove image
    item.querySelector('[data-remove-img]').addEventListener('click', async e => {
      e.stopPropagation();
      const target = editingImages[idx];

      if (target.id) {
        // Remove DB record
        const { error } = await sb.from('project_images').delete().eq('id', target.id);
        if (error) { toast('Failed to remove image from database', 'error'); return; }
        // Best-effort storage delete
        try { await deleteFile(target.path); } catch (_) {}
      }

      editingImages.splice(idx, 1);
      editingImages.forEach((im, k) => { im.sort_order = k; });

      // Ensure a cover still exists
      if (editingImages.length && !editingImages.some(i => i.is_cover)) {
        editingImages[0].is_cover = true;
      }

      renderGallery();
    });

    /* ── Drag-to-reorder ─────────────────────── */
    item.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', String(idx));
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => { item.style.opacity = '0.4'; }, 0);
    });

    item.addEventListener('dragend', () => {
      item.style.opacity = '1';
    });

    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.style.outline = '1px solid var(--taupe)';
    });

    item.addEventListener('dragleave', () => {
      item.style.outline = '';
    });

    item.addEventListener('drop', e => {
      e.preventDefault();
      item.style.outline = '';
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toIdx   = idx;
      if (fromIdx === toIdx) return;

      const moved = editingImages.splice(fromIdx, 1)[0];
      editingImages.splice(toIdx, 0, moved);
      editingImages.forEach((im, k) => { im.sort_order = k; });
      renderGallery();
    });

    grid.appendChild(item);
  });
}

/* =============================================
   PROJECT ACTIONS (table row)
============================================= */

async function duplicateProject(id) {
  try {
    const { data: p, error } = await sb.from('projects').select('*').eq('id', id).single();
    if (error) throw error;

    const { error: e2 } = await sb.from('projects').insert({
      ...p,
      id            : undefined,
      title         : (p.title || 'Untitled') + ' (Copy)',
      slug          : (p.slug  || 'project') + '-copy-' + Date.now(),
      status        : 'draft',
      featured      : false,
      cover_image_url: p.cover_image_url || null,
      created_at    : undefined,
      updated_at    : undefined,
    });

    if (e2) throw e2;

    toast('Project duplicated as draft', 'success');
    loadProjects();
  } catch (e) {
    logError('duplicateProject', e);
    toast('Failed to duplicate project', 'error');
  }
}

async function togglePublish(id, currentStatus) {
  const newStatus = currentStatus === 'published' ? 'draft' : 'published';
  try {
    const { error } = await sb.from('projects').update({ status: newStatus }).eq('id', id);
    if (error) throw error;
    toast(`Project ${newStatus}`, 'success');
    loadProjects();
    loadDashboard();
  } catch (e) {
    logError('togglePublish', e);
    toast('Failed to update status', 'error');
  }
}

function confirmDeleteProject(id, title) {
  showConfirm(
    `Delete <strong>${escHtml(title)}</strong>?<br><br>
     All images and data for this project will be permanently removed.`,
    () => deleteProject(id)
  );
}

async function deleteProject(id) {
  try {
    // 1. Fetch image paths so we can remove from Storage
    const { data: imgs } = await sb
      .from('project_images')
      .select('path')
      .eq('project_id', id);

    if (imgs?.length) {
      const paths = imgs.map(i => i.path).filter(Boolean);
      if (paths.length) {
        await sb.storage.from(BUCKET.PROJECTS).remove(paths);
      }
    }

    // 2. Delete image rows
    await sb.from('project_images').delete().eq('project_id', id);

    // 3. Delete project row
    const { error } = await sb.from('projects').delete().eq('id', id);
    if (error) throw error;

    toast('Project deleted', 'success');
    loadProjects();
    loadDashboard();
  } catch (e) {
    logError('deleteProject', e);
    toast('Failed to delete project', 'error');
  }
}

/* =============================================
   SERVICES
============================================= */
async function loadServices() {
  const list = document.getElementById('servicesList');
  if (!list) return;
  list.innerHTML = '<div class="spinner"></div>';

  try {
    const { data, error } = await sb
      .from('services')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    renderServicesList(data || []);
  } catch (e) {
    logError('loadServices', e);
    toast('Failed to load services', 'error');
  }
}

function renderServicesList(services) {
  const list = document.getElementById('servicesList');
  if (!list) return;

  if (!services.length) {
    list.innerHTML = `<div class="empty-state"><p>No services yet — add your first one</p></div>`;
    return;
  }

  list.innerHTML = '';

  services.forEach((svc, idx) => {
    const item     = document.createElement('div');
    item.className = 'service-item';
    item.dataset.id = svc.id;

    item.innerHTML = `
      <span class="service-item-num">${String(idx + 1).padStart(2, '0')}</span>
      <div>
        <div class="service-item-title">${escHtml(svc.title)}</div>
        <div class="service-item-desc">${escHtml(svc.description || '')}</div>
      </div>
      <div class="row-actions">
        <button class="icon-btn" title="Edit" data-svc-edit="${svc.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="icon-btn danger" title="Delete"
          data-svc-del="${svc.id}" data-svc-title="${escHtml(svc.title)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          </svg>
        </button>
      </div>`;

    item.querySelector('[data-svc-edit]').addEventListener('click', () => openServiceModal(svc));
    item.querySelector('[data-svc-del]').addEventListener('click', () => {
      showConfirm(
        `Delete service <strong>${escHtml(svc.title)}</strong>?`,
        async () => {
          const { error } = await sb.from('services').delete().eq('id', svc.id);
          if (error) { toast('Delete failed', 'error'); return; }
          toast('Service deleted', 'success');
          loadServices();
        }
      );
    });

    list.appendChild(item);
  });
}

function openServiceModal(svc = null) {
  setVal('serviceId',     svc?.id          || '');
  setVal('sTitle',        svc?.title       || '');
  setVal('sDescription',  svc?.description || '');
  setVal('sSortOrder',    svc?.sort_order  ?? 0);
  const titleEl = document.getElementById('serviceModalTitle');
  if (titleEl) titleEl.textContent = svc ? 'Edit Service' : 'Add Service';
  openModal('serviceModal');
}

async function saveService() {
  const id    = document.getElementById('serviceId')?.value;
  const title = (document.getElementById('sTitle')?.value || '').trim();
  if (!title) { toast('Title is required', 'warn'); return; }

  const payload = {
    title,
    description : (document.getElementById('sDescription')?.value || '').trim(),
    sort_order  : parseInt(document.getElementById('sSortOrder')?.value) || 0,
  };

  try {
    if (id) {
      const { error } = await sb.from('services').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await sb.from('services').insert(payload);
      if (error) throw error;
    }
    toast(id ? 'Service updated' : 'Service added', 'success');
    closeModal('serviceModal');
    loadServices();
  } catch (e) {
    logError('saveService', e);
    toast('Failed to save service', 'error');
  }
}

/* =============================================
   TESTIMONIALS
============================================= */
async function loadTestimonials() {
  const list = document.getElementById('testimonialList');
  if (!list) return;
  list.innerHTML = '<div class="spinner"></div>';

  try {
    const { data, error } = await sb
      .from('testimonials')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;
    renderTestimonialList(data || []);
  } catch (e) {
    logError('loadTestimonials', e);
    toast('Failed to load testimonials', 'error');
  }
}

function renderTestimonialList(items) {
  const list = document.getElementById('testimonialList');
  if (!list) return;

  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><p>No testimonials yet</p></div>`;
    return;
  }

  list.innerHTML = '';

  items.forEach(t => {
    const item     = document.createElement('div');
    item.className = 'testimonial-item';
    item.innerHTML = `
      <div>
        <div class="testimonial-quote">"${escHtml(t.quote)}"</div>
        <div class="testimonial-meta">
          ${escHtml(t.client_name)}${t.client_role ? ' · ' + escHtml(t.client_role) : ''}
        </div>
      </div>
      <div class="row-actions">
        <button class="icon-btn" title="Edit" data-t-edit="${t.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="icon-btn danger" title="Delete" data-t-del="${t.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          </svg>
        </button>
      </div>`;

    item.querySelector('[data-t-edit]').addEventListener('click', () => openTestimonialModal(t));
    item.querySelector('[data-t-del]').addEventListener('click', () => {
      showConfirm(
        `Delete testimonial from <strong>${escHtml(t.client_name)}</strong>?`,
        async () => {
          const { error } = await sb.from('testimonials').delete().eq('id', t.id);
          if (error) { toast('Delete failed', 'error'); return; }
          toast('Testimonial deleted', 'success');
          loadTestimonials();
        }
      );
    });

    list.appendChild(item);
  });
}

function openTestimonialModal(t = null) {
  setVal('testimonialId', t?.id          || '');
  setVal('tQuote',        t?.quote       || '');
  setVal('tName',         t?.client_name || '');
  setVal('tRole',         t?.client_role || '');
  const titleEl = document.getElementById('testimonialModalTitle');
  if (titleEl) titleEl.textContent = t ? 'Edit Testimonial' : 'Add Testimonial';
  openModal('testimonialModal');
}

async function saveTestimonial() {
  const id    = document.getElementById('testimonialId')?.value;
  const quote = (document.getElementById('tQuote')?.value || '').trim();
  const name  = (document.getElementById('tName')?.value  || '').trim();

  if (!quote || !name) {
    toast('Quote and client name are required', 'warn');
    return;
  }

  const payload = {
    quote,
    client_name : name,
    client_role : (document.getElementById('tRole')?.value || '').trim(),
  };

  try {
    if (id) {
      const { error } = await sb.from('testimonials').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await sb.from('testimonials').insert(payload);
      if (error) throw error;
    }
    toast(id ? 'Testimonial updated' : 'Testimonial added', 'success');
    closeModal('testimonialModal');
    loadTestimonials();
  } catch (e) {
    logError('saveTestimonial', e);
    toast('Failed to save testimonial', 'error');
  }
}

/* =============================================
   SITE SETTINGS
============================================= */

// Module-level settings cache bust flag
// Stores the real PK of the settings row once fetched or created
let _settingsRowId = null;

async function loadSettings() {
  try {
    // Fetch without .single() so 0 rows doesn't throw
    let { data: rows, error } = await sb
      .from('site_settings')
      .select('*')
      .limit(1);

    if (error) throw error;

    // If the table is empty, insert a blank row so the admin can start filling it in
    if (!rows || rows.length === 0) {
      const { data: inserted, error: insertErr } = await sb
        .from('site_settings')
        .insert({})
        .select()
        .single();

      if (insertErr) throw insertErr;
      rows = [inserted];
      toast('Settings row created — fill in your details and save', 'info');
    }

    const data = rows[0];
    _settingsRowId = data.id;   // store the real PK (UUID or integer)

    const form = document.getElementById('settingsForm');
    if (!form) return;

    Object.entries(data).forEach(([key, val]) => {
      const el = form.querySelector(`[name="${key}"]`);
      if (el && val != null) el.value = val;
    });

    // Let the inline image-preview script in admin.html pre-fill existing images
    window.dispatchEvent(new CustomEvent('settingsLoaded', { detail: data }));

  } catch (e) {
    console.error('loadSettings error:', e);
    toast('Failed to load settings: ' + (e.message || 'unknown error'), 'error');
  }
}

async function saveSettings() {
  const btn = document.getElementById('saveSettingsBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving…';
  }

  try {
    const form = document.getElementById('settingsForm');
    if (!form) return;

    // Collect form values; send null for blank URL fields instead of ""
    const URL_FIELDS = ['hero_image_url', 'about_image_url', 'social_instagram', 'social_linkedin', 'social_behance'];
    const payload = {};
    new FormData(form).forEach((val, key) => {
      if (key === 'id') return;
      const trimmed = String(val).trim();
      payload[key] = (URL_FIELDS.includes(key) && trimmed === '') ? null : (trimmed === '' ? null : trimmed);
    });

    if (_settingsRowId !== null) {
      // Row exists — update it by its real PK
      const { error } = await sb
        .from('site_settings')
        .update(payload)
        .eq('id', _settingsRowId);
      if (error) throw error;
    } else {
      // No row loaded yet — insert fresh
      const { data, error } = await sb
        .from('site_settings')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      _settingsRowId = data.id;
    }

    toast('Settings saved', 'success');

  } catch (e) {
    console.error('saveSettings error:', e);
    toast('Failed to save settings: ' + (e.message || 'unknown error'), 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save All Changes';
    }
  }
}
/* =============================================
   EVENT WIRING
   All DOM event listeners in one place.
============================================= */
function wireEvents() {

  /* ── Sidebar nav links ──────────────────────── */
  document.querySelectorAll('.sidebar-link[data-panel]').forEach(link => {
    link.addEventListener('click', () => showPanel(link.dataset.panel));
  });

  /* ── Sidebar mobile toggle ──────────────────── */
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });

  /* ── Sign out ─────────────────────────────────── */
  document.getElementById('signoutBtn')?.addEventListener('click', async () => {
    await signOut();
    window.location.href = '/login.html';
  });

  /* ── New project buttons (dashboard + projects panel) ── */
  document.getElementById('newProjectBtn')?.addEventListener('click',   () => openProjectModal());
  document.getElementById('dashNewProject')?.addEventListener('click',  () => {
    showPanel('projects');
    setTimeout(() => openProjectModal(), 80);
  });

  /* ── Project modal save ─────────────────────── */
  document.getElementById('saveProjectBtn')?.addEventListener('click', saveProject);

  /* ── Project modal close ────────────────────── */
  document.getElementById('projectModalClose')?.addEventListener('click',  () => closeModal('projectModal'));
  document.getElementById('projectModalCancel')?.addEventListener('click', () => closeModal('projectModal'));

  /* ── Auto-slug from title ───────────────────── */
  document.getElementById('pTitle')?.addEventListener('input', e => {
    const slugEl = document.getElementById('pSlug');
    if (slugEl && !slugEl.dataset.manual) {
      slugEl.value = generateSlug(e.target.value);
    }
  });

  document.getElementById('pSlug')?.addEventListener('input', e => {
    if (e.target) e.target.dataset.manual = e.target.value ? 'true' : '';
  });

  /* ── Project filters ────────────────────────── */
  wireProjectFilters();

  /* ── Upload zone drag & drop ────────────────── */
  const uploadZone  = document.getElementById('uploadZone');
  const uploadInput = document.getElementById('imageUploadInput');

  uploadZone?.addEventListener('dragover',  e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone?.addEventListener('dragleave', ()  => uploadZone.classList.remove('dragover'));
  uploadZone?.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  uploadInput?.addEventListener('change', () => {
    handleFiles(uploadInput.files);
    uploadInput.value = '';   // reset so same file can be re-selected
  });

  /* ── Services ───────────────────────────────── */
  document.getElementById('newServiceBtn')?.addEventListener('click', () => openServiceModal());
  document.getElementById('serviceModalClose')?.addEventListener('click',  () => closeModal('serviceModal'));
  document.getElementById('serviceModalCancel')?.addEventListener('click', () => closeModal('serviceModal'));
  document.getElementById('saveServiceBtn')?.addEventListener('click', saveService);

  /* ── Testimonials ───────────────────────────── */
  document.getElementById('newTestimonialBtn')?.addEventListener('click', () => openTestimonialModal());
  document.getElementById('testimonialModalClose')?.addEventListener('click',  () => closeModal('testimonialModal'));
  document.getElementById('testimonialModalCancel')?.addEventListener('click', () => closeModal('testimonialModal'));
  document.getElementById('saveTestimonialBtn')?.addEventListener('click', saveTestimonial);

  /* ── Settings ───────────────────────────────── */
  document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);

  /* ── Confirm modal cancel / close ───────────── */
  document.getElementById('confirmModalClose')?.addEventListener('click',  () => closeModal('confirmModal'));
  document.getElementById('confirmModalCancel')?.addEventListener('click', () => closeModal('confirmModal'));

  /* ── Close any modal on backdrop click ──────── */
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

/* =============================================
   BOOT
============================================= */
async function init() {
  // Auth guard — redirect to login if not an admin
  currentUser = await requireAdmin();
  if (!currentUser) return;

  // Show user info in sidebar footer
  const email = currentUser.email || '';
  const emailEl    = document.getElementById('userEmail');
  const initialsEl = document.getElementById('userInitials');
  if (emailEl)    emailEl.textContent    = email;
  if (initialsEl) initialsEl.textContent = email.slice(0, 2).toUpperCase();

  // Wire all DOM events
  wireEvents();

  // Land on dashboard
  showPanel('dashboard');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}