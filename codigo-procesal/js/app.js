(function () {
  'use strict';

  let codigoData = null;
  let allArticles = [];
  let articleIndex = {};

  // === Init ===
  async function init() {
    try {
      const resp = await fetch('data/codigo-procesal.json');
      codigoData = await resp.json();
    } catch (e) {
      document.getElementById('mainContent').innerHTML =
        '<p style="padding:2rem;color:red;">Error al cargar los datos del codigo procesal.</p>';
      return;
    }

    document.getElementById('headerTitle').textContent = codigoData.titulo;
    if (codigoData.jurisdiccion) {
      document.getElementById('headerSubtitle').textContent = codigoData.jurisdiccion;
    }

    buildArticleIndex();
    renderNavTree();
    renderStats();
    setupSearch();
    setupSidebarToggle();
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
  }

  // === Build flat article index ===
  function buildArticleIndex() {
    allArticles = [];
    for (const libro of codigoData.libros) {
      for (const seccion of libro.secciones) {
        for (const capitulo of seccion.capitulos) {
          for (const art of capitulo.articulos) {
            const entry = {
              ...art,
              libroId: libro.id,
              libroTitulo: 'Libro ' + libro.numero + ': ' + libro.titulo,
              seccionId: seccion.id,
              seccionTitulo: 'Seccion ' + seccion.numero + ': ' + seccion.titulo,
              capituloId: capitulo.id,
              capituloTitulo: 'Capitulo ' + capitulo.numero + ': ' + capitulo.titulo,
              path: 'Libro ' + libro.numero + ' > Secc. ' + seccion.numero + ' > Cap. ' + capitulo.numero
            };
            allArticles.push(entry);
            articleIndex[art.id] = entry;
          }
        }
      }
    }
  }

  // === Nav Tree ===
  function renderNavTree() {
    const container = document.getElementById('navTree');
    let html = '';

    for (const libro of codigoData.libros) {
      html += '<div class="nav-libro">';
      html += '<button class="nav-libro-header" data-libro="' + libro.id + '">';
      html += 'Libro ' + libro.numero + ' - ' + libro.titulo;
      html += '</button>';

      for (const seccion of libro.secciones) {
        html += '<button class="nav-seccion-header" data-seccion="' + seccion.id + '">';
        html += '<span class="arrow">&#9654;</span>';
        html += 'Secc. ' + seccion.numero + ' - ' + escapeHtml(seccion.titulo);
        html += '</button>';

        html += '<div class="nav-capitulo-group" data-seccion-group="' + seccion.id + '">';
        for (const cap of seccion.capitulos) {
          html += '<button class="nav-capitulo-header" data-capitulo="' + cap.id + '">';
          html += 'Cap. ' + cap.numero + ' - ' + escapeHtml(cap.titulo);
          html += '</button>';

          for (const art of cap.articulos) {
            html += '<button class="nav-article-link" data-article="' + art.id + '">';
            html += 'Art. ' + art.numero + ' - ' + escapeHtml(art.titulo);
            html += '</button>';
          }
        }
        html += '</div>';
      }
      html += '</div>';
    }

    container.innerHTML = html;

    // Event delegation
    container.addEventListener('click', function (e) {
      const target = e.target.closest('button');
      if (!target) return;

      if (target.classList.contains('nav-seccion-header')) {
        const seccionId = target.dataset.seccion;
        const group = container.querySelector('[data-seccion-group="' + seccionId + '"]');
        const isExpanded = group.classList.contains('expanded');
        group.classList.toggle('expanded');
        target.classList.toggle('expanded');
        if (!isExpanded) {
          window.location.hash = '#seccion/' + seccionId;
        }
      } else if (target.classList.contains('nav-capitulo-header')) {
        window.location.hash = '#capitulo/' + target.dataset.capitulo;
      } else if (target.classList.contains('nav-article-link')) {
        window.location.hash = '#articulo/' + target.dataset.article;
        closeSidebarMobile();
      }
    });
  }

  // === Stats ===
  function renderStats() {
    const libros = codigoData.libros.length;
    let secciones = 0, capitulos = 0;
    for (const l of codigoData.libros) {
      secciones += l.secciones.length;
      for (const s of l.secciones) {
        capitulos += s.capitulos.length;
      }
    }

    document.getElementById('stats').innerHTML =
      '<div class="stat-card"><div class="stat-number">' + allArticles.length + '</div><div class="stat-label">Articulos</div></div>' +
      '<div class="stat-card"><div class="stat-number">' + secciones + '</div><div class="stat-label">Secciones</div></div>' +
      '<div class="stat-card"><div class="stat-number">' + capitulos + '</div><div class="stat-label">Capitulos</div></div>' +
      '<div class="stat-card"><div class="stat-number">' + libros + '</div><div class="stat-label">Libros</div></div>';
  }

  // === Search ===
  function setupSearch() {
    const input = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('searchResults');
    let debounceTimer = null;

    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        performSearch(input.value.trim());
      }, 200);
    });

    input.addEventListener('focus', function () {
      if (input.value.trim().length >= 2) {
        performSearch(input.value.trim());
      }
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search-container')) {
        resultsDiv.classList.remove('active');
      }
    });

    resultsDiv.addEventListener('click', function (e) {
      const item = e.target.closest('.search-result-item');
      if (item) {
        window.location.hash = '#articulo/' + item.dataset.article;
        resultsDiv.classList.remove('active');
        input.value = '';
        closeSidebarMobile();
      }
    });
  }

  function performSearch(query) {
    const resultsDiv = document.getElementById('searchResults');

    if (query.length < 2) {
      resultsDiv.classList.remove('active');
      return;
    }

    const queryLower = normalizeStr(query);
    const queryNum = parseInt(query, 10);
    const results = [];

    for (const art of allArticles) {
      let score = 0;
      let snippet = '';

      // Exact article number match
      if (!isNaN(queryNum) && art.numero === queryNum) {
        score = 100;
      }
      // Article number contains query
      else if (!isNaN(queryNum) && String(art.numero).includes(String(queryNum))) {
        score = 50;
      }

      // Title match
      const titleNorm = normalizeStr(art.titulo);
      if (titleNorm.includes(queryLower)) {
        score = Math.max(score, 80);
      }

      // Content match
      const contentNorm = normalizeStr(art.contenido);
      const idx = contentNorm.indexOf(queryLower);
      if (idx !== -1) {
        score = Math.max(score, 30);
        const start = Math.max(0, idx - 40);
        const end = Math.min(art.contenido.length, idx + query.length + 60);
        snippet = (start > 0 ? '...' : '') +
          art.contenido.substring(start, end) +
          (end < art.contenido.length ? '...' : '');
      }

      if (score > 0) {
        results.push({ art: art, score: score, snippet: snippet });
      }
    }

    results.sort(function (a, b) { return b.score - a.score; });
    const top = results.slice(0, 15);

    if (top.length === 0) {
      resultsDiv.innerHTML = '<div class="search-no-results">No se encontraron resultados para "' + escapeHtml(query) + '"</div>';
    } else {
      let html = '';
      for (const r of top) {
        html += '<div class="search-result-item" data-article="' + r.art.id + '">';
        html += '<div class="search-result-num">Art. ' + r.art.numero + ' - ' + highlightMatch(escapeHtml(r.art.titulo), query) + '</div>';
        html += '<div class="search-result-path">' + escapeHtml(r.art.path) + '</div>';
        if (r.snippet) {
          html += '<div class="search-result-snippet">' + highlightMatch(escapeHtml(r.snippet), query) + '</div>';
        }
        html += '</div>';
      }
      resultsDiv.innerHTML = html;
    }

    resultsDiv.classList.add('active');
  }

  // === Hash Routing ===
  function handleHashChange() {
    const hash = window.location.hash.substring(1);
    if (!hash) {
      showWelcome();
      return;
    }

    const parts = hash.split('/');
    const type = parts[0];
    const id = parts[1];

    if (type === 'articulo' && articleIndex[id]) {
      showArticle(id);
    } else if (type === 'seccion') {
      showSection(id);
    } else if (type === 'capitulo') {
      showCapitulo(id);
    } else {
      showWelcome();
    }
  }

  function showWelcome() {
    document.getElementById('welcomeScreen').style.display = '';
    document.getElementById('articleView').style.display = 'none';
    document.getElementById('sectionView').style.display = 'none';
    clearActiveNav();
  }

  function showArticle(artId) {
    const art = articleIndex[artId];
    if (!art) return;

    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('sectionView').style.display = 'none';
    document.getElementById('articleView').style.display = '';

    // Breadcrumb
    document.getElementById('breadcrumb').innerHTML =
      '<span class="breadcrumb-link" onclick="location.hash=\'\'">Inicio</span>' +
      '<span class="breadcrumb-sep">&rsaquo;</span>' +
      '<span class="breadcrumb-link" onclick="location.hash=\'#seccion/' + art.seccionId + '\'">' + escapeHtml(art.seccionTitulo) + '</span>' +
      '<span class="breadcrumb-sep">&rsaquo;</span>' +
      '<span class="breadcrumb-link" onclick="location.hash=\'#capitulo/' + art.capituloId + '\'">' + escapeHtml(art.capituloTitulo) + '</span>' +
      '<span class="breadcrumb-sep">&rsaquo;</span>' +
      '<span>Art. ' + art.numero + '</span>';

    // Article content
    const formatted = formatArticleBody(art.contenido);
    document.getElementById('articleContent').innerHTML =
      '<div class="article-header">' +
      '<div class="article-number">Articulo ' + art.numero + '</div>' +
      '<h2 class="article-title">' + escapeHtml(art.titulo) + '</h2>' +
      '</div>' +
      '<div class="article-body">' + formatted + '</div>';

    // Prev/Next nav
    const idx = allArticles.indexOf(art);
    let navHtml = '';
    if (idx > 0) {
      const prev = allArticles[idx - 1];
      navHtml += '<button class="article-nav-btn prev" onclick="location.hash=\'#articulo/' + prev.id + '\'">' +
        '<span>&#8592;</span><div><div class="nav-btn-label">Anterior</div>' +
        '<div class="nav-btn-title">Art. ' + prev.numero + ' - ' + escapeHtml(prev.titulo) + '</div></div></button>';
    }
    if (idx < allArticles.length - 1) {
      const next = allArticles[idx + 1];
      navHtml += '<button class="article-nav-btn next" onclick="location.hash=\'#articulo/' + next.id + '\'">' +
        '<div><div class="nav-btn-label">Siguiente</div>' +
        '<div class="nav-btn-title">Art. ' + next.numero + ' - ' + escapeHtml(next.titulo) + '</div></div><span>&#8594;</span></button>';
    }
    document.getElementById('articleNav').innerHTML = navHtml;

    // Expand nav tree to show this article
    expandNavTo(art);
    setActiveNav(artId);

    // Scroll to top
    document.getElementById('mainContent').scrollTop = 0;
  }

  function showSection(seccionId) {
    let seccion = null;
    let libro = null;
    for (const l of codigoData.libros) {
      for (const s of l.secciones) {
        if (s.id === seccionId) {
          seccion = s;
          libro = l;
          break;
        }
      }
    }
    if (!seccion) return;

    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('articleView').style.display = 'none';
    document.getElementById('sectionView').style.display = '';

    document.getElementById('sectionBreadcrumb').innerHTML =
      '<span class="breadcrumb-link" onclick="location.hash=\'\'">Inicio</span>' +
      '<span class="breadcrumb-sep">&rsaquo;</span>' +
      '<span>Libro ' + libro.numero + ' - ' + escapeHtml(libro.titulo) + '</span>' +
      '<span class="breadcrumb-sep">&rsaquo;</span>' +
      '<span>Seccion ' + seccion.numero + '</span>';

    document.getElementById('sectionTitle').textContent =
      'Seccion ' + seccion.numero + ' - ' + seccion.titulo;

    let html = '';
    for (const cap of seccion.capitulos) {
      html += '<h3 style="margin:1.25rem 0 0.5rem;color:var(--color-primary-light);font-size:1rem;">' +
        'Capitulo ' + cap.numero + ' - ' + escapeHtml(cap.titulo) + '</h3>';
      for (const art of cap.articulos) {
        html += '<div class="article-list-item" onclick="location.hash=\'#articulo/' + art.id + '\'">' +
          '<div><div class="article-list-num">Art. ' + art.numero + '</div></div>' +
          '<div><div class="article-list-title">' + escapeHtml(art.titulo) + '</div>' +
          '<div class="article-list-preview">' + escapeHtml(art.contenido.substring(0, 150)) + '...</div></div>' +
          '</div>';
      }
    }
    document.getElementById('articlesList').innerHTML = html;
    document.getElementById('mainContent').scrollTop = 0;
  }

  function showCapitulo(capId) {
    // Find the capitulo and show its section, scrolling to the capitulo
    for (const l of codigoData.libros) {
      for (const s of l.secciones) {
        for (const c of s.capitulos) {
          if (c.id === capId && c.articulos.length > 0) {
            showArticle(c.articulos[0].id);
            return;
          }
        }
      }
    }
  }

  // === Nav Helpers ===
  function expandNavTo(art) {
    const group = document.querySelector('[data-seccion-group="' + art.seccionId + '"]');
    const header = document.querySelector('[data-seccion="' + art.seccionId + '"]');
    if (group) group.classList.add('expanded');
    if (header) header.classList.add('expanded');
  }

  function setActiveNav(artId) {
    clearActiveNav();
    const link = document.querySelector('[data-article="' + artId + '"]');
    if (link) {
      link.classList.add('active');
      // Scroll into view in sidebar
      link.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function clearActiveNav() {
    var active = document.querySelectorAll('.nav-article-link.active');
    for (var i = 0; i < active.length; i++) {
      active[i].classList.remove('active');
    }
  }

  // === Mobile Sidebar ===
  function setupSidebarToggle() {
    var toggle = document.getElementById('sidebarToggle');
    var sidebar = document.getElementById('sidebar');

    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('open');
    });

    // Close on overlay click
    document.addEventListener('click', function (e) {
      if (sidebar.classList.contains('open') &&
          !e.target.closest('.sidebar') &&
          !e.target.closest('.sidebar-toggle')) {
        sidebar.classList.remove('open');
      }
    });
  }

  function closeSidebarMobile() {
    document.getElementById('sidebar').classList.remove('open');
  }

  // === Utilities ===
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function normalizeStr(str) {
    return str.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function highlightMatch(text, query) {
    if (!query) return text;
    var escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('(' + escaped + ')', 'gi');
    return text.replace(re, '<mark>$1</mark>');
  }

  function formatArticleBody(text) {
    // Split numbered items into a list format
    var lines = text.split('\n');
    var html = '';
    var inList = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      var match = line.match(/^(\d+)\)\s*(.*)/);
      if (match) {
        if (!inList) {
          html += '<ol start="' + match[1] + '" style="padding-left:1.5rem;margin:0.75rem 0;">';
          inList = true;
        }
        html += '<li style="margin-bottom:0.5rem;">' + escapeHtml(match[2]) + '</li>';
      } else {
        if (inList) {
          html += '</ol>';
          inList = false;
        }
        html += '<p>' + escapeHtml(line) + '</p>';
      }
    }
    if (inList) html += '</ol>';
    return html;
  }

  // === Start ===
  document.addEventListener('DOMContentLoaded', init);
})();
