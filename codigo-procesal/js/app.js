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
        '<p style="padding:2rem;color:red;">Error al cargar los datos del código procesal.</p>';
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
  // New hierarchy: libro > titulo > capitulo > [seccion] > articulo
  function buildArticleIndex() {
    allArticles = [];
    for (var li = 0; li < codigoData.libros.length; li++) {
      var libro = codigoData.libros[li];
      for (var ti = 0; ti < libro.titulos.length; ti++) {
        var titulo = libro.titulos[ti];
        for (var ci = 0; ci < titulo.capitulos.length; ci++) {
          var capitulo = titulo.capitulos[ci];

          // Articles directly under capitulo (no section)
          for (var ai = 0; ai < capitulo.articulos.length; ai++) {
            var art = capitulo.articulos[ai];
            addArticle(art, libro, titulo, capitulo, null);
          }

          // Articles under sections within capitulo
          for (var si = 0; si < capitulo.secciones.length; si++) {
            var seccion = capitulo.secciones[si];
            for (var sai = 0; sai < seccion.articulos.length; sai++) {
              var sart = seccion.articulos[sai];
              addArticle(sart, libro, titulo, capitulo, seccion);
            }
          }
        }
      }
    }
  }

  function addArticle(art, libro, titulo, capitulo, seccion) {
    var pathParts = ['Libro ' + libro.numero, 'Tít. ' + titulo.numero, 'Cap. ' + capitulo.numero];
    if (seccion) pathParts.push('Secc. ' + seccion.numero);

    var entry = {
      id: art.id,
      numero: art.numero,
      titulo: art.titulo,
      contenido: art.contenido,
      libroId: libro.id,
      libroTitulo: 'Libro ' + libro.numero + ': ' + libro.titulo,
      tituloId: titulo.id,
      tituloNumero: titulo.numero,
      tituloTitulo: 'Título ' + titulo.numero + ': ' + titulo.titulo,
      capituloId: capitulo.id,
      capituloNumero: capitulo.numero,
      capituloTitulo: 'Capítulo ' + capitulo.numero + ': ' + capitulo.titulo,
      seccionId: seccion ? seccion.id : null,
      seccionTitulo: seccion ? ('Sección ' + seccion.numero + ': ' + seccion.titulo) : null,
      path: pathParts.join(' › ')
    };
    allArticles.push(entry);
    articleIndex[art.id] = entry;
  }

  // === Nav Tree ===
  function renderNavTree() {
    var container = document.getElementById('navTree');
    var html = '';

    for (var li = 0; li < codigoData.libros.length; li++) {
      var libro = codigoData.libros[li];
      html += '<div class="nav-libro">';
      html += '<button class="nav-libro-header">';
      html += escapeHtml('Libro ' + libro.numero + ' – ' + libro.titulo);
      html += '</button>';

      for (var ti = 0; ti < libro.titulos.length; ti++) {
        var titulo = libro.titulos[ti];
        html += '<button class="nav-titulo-header" data-titulo="' + titulo.id + '">';
        html += '<span class="arrow">&#9654;</span>';
        html += escapeHtml('Tít. ' + titulo.numero + ' – ' + titulo.titulo);
        html += '</button>';

        html += '<div class="nav-titulo-group" data-titulo-group="' + titulo.id + '">';

        for (var ci = 0; ci < titulo.capitulos.length; ci++) {
          var capitulo = titulo.capitulos[ci];
          html += '<button class="nav-capitulo-header" data-capitulo="' + capitulo.id + '">';
          html += '<span class="arrow">&#9654;</span>';
          html += escapeHtml('Cap. ' + capitulo.numero + ' – ' + capitulo.titulo);
          html += '</button>';

          html += '<div class="nav-capitulo-group" data-capitulo-group="' + capitulo.id + '">';

          // Direct articles (no section)
          for (var ai = 0; ai < capitulo.articulos.length; ai++) {
            var art = capitulo.articulos[ai];
            html += '<button class="nav-article-link" data-article="' + art.id + '">';
            html += 'Art. ' + art.numero + ' – ' + escapeHtml(truncate(art.titulo, 50));
            html += '</button>';
          }

          // Sections with articles
          for (var si = 0; si < capitulo.secciones.length; si++) {
            var seccion = capitulo.secciones[si];
            html += '<button class="nav-seccion-header" data-seccion="' + seccion.id + '">';
            html += '<span class="arrow">&#9654;</span>';
            html += escapeHtml('Secc. ' + seccion.numero + ' – ' + truncate(seccion.titulo, 45));
            html += '</button>';

            html += '<div class="nav-seccion-group" data-seccion-group="' + seccion.id + '">';
            for (var sai = 0; sai < seccion.articulos.length; sai++) {
              var sart = seccion.articulos[sai];
              html += '<button class="nav-article-link" data-article="' + sart.id + '">';
              html += 'Art. ' + sart.numero + ' – ' + escapeHtml(truncate(sart.titulo, 45));
              html += '</button>';
            }
            html += '</div>';
          }

          html += '</div>'; // capitulo-group
        }

        html += '</div>'; // titulo-group
      }

      html += '</div>'; // libro
    }

    container.innerHTML = html;

    // Event delegation
    container.addEventListener('click', function (e) {
      var target = e.target.closest('button');
      if (!target) return;

      if (target.classList.contains('nav-titulo-header')) {
        toggleGroup(container, 'titulo-group', target.dataset.titulo, target);
      } else if (target.classList.contains('nav-capitulo-header')) {
        toggleGroup(container, 'capitulo-group', target.dataset.capitulo, target);
      } else if (target.classList.contains('nav-seccion-header')) {
        toggleGroup(container, 'seccion-group', target.dataset.seccion, target);
      } else if (target.classList.contains('nav-article-link')) {
        window.location.hash = '#articulo/' + target.dataset.article;
        closeSidebarMobile();
      }
    });
  }

  function toggleGroup(container, groupAttr, id, headerBtn) {
    var group = container.querySelector('[data-' + groupAttr + '="' + id + '"]');
    if (group) {
      group.classList.toggle('expanded');
      headerBtn.classList.toggle('expanded');
    }
  }

  // === Stats ===
  function renderStats() {
    var libros = codigoData.libros.length;
    var titulos = 0, capitulos = 0, secciones = 0;
    for (var i = 0; i < codigoData.libros.length; i++) {
      var libro = codigoData.libros[i];
      titulos += libro.titulos.length;
      for (var j = 0; j < libro.titulos.length; j++) {
        var titulo = libro.titulos[j];
        capitulos += titulo.capitulos.length;
        for (var k = 0; k < titulo.capitulos.length; k++) {
          secciones += titulo.capitulos[k].secciones.length;
        }
      }
    }

    document.getElementById('stats').innerHTML =
      '<div class="stat-card"><div class="stat-number">' + allArticles.length + '</div><div class="stat-label">Artículos</div></div>' +
      '<div class="stat-card"><div class="stat-number">' + capitulos + '</div><div class="stat-label">Capítulos</div></div>' +
      '<div class="stat-card"><div class="stat-number">' + titulos + '</div><div class="stat-label">Títulos</div></div>' +
      '<div class="stat-card"><div class="stat-number">' + libros + '</div><div class="stat-label">Libros</div></div>';
  }

  // === Search ===
  function setupSearch() {
    var input = document.getElementById('searchInput');
    var resultsDiv = document.getElementById('searchResults');
    var debounceTimer = null;

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
      var item = e.target.closest('.search-result-item');
      if (item) {
        window.location.hash = '#articulo/' + item.dataset.article;
        resultsDiv.classList.remove('active');
        input.value = '';
        closeSidebarMobile();
      }
    });
  }

  function performSearch(query) {
    var resultsDiv = document.getElementById('searchResults');

    if (query.length < 2) {
      resultsDiv.classList.remove('active');
      return;
    }

    var queryLower = normalizeStr(query);
    var queryNum = parseInt(query, 10);
    var results = [];

    for (var i = 0; i < allArticles.length; i++) {
      var art = allArticles[i];
      var score = 0;
      var snippet = '';

      // Exact article number match
      if (!isNaN(queryNum) && art.numero === queryNum) {
        score = 100;
      } else if (!isNaN(queryNum) && String(art.numero).includes(String(queryNum))) {
        score = 50;
      }

      // Title match
      var titleNorm = normalizeStr(art.titulo);
      if (titleNorm.includes(queryLower)) {
        score = Math.max(score, 80);
      }

      // Content match
      var contentNorm = normalizeStr(art.contenido);
      var idx = contentNorm.indexOf(queryLower);
      if (idx !== -1) {
        score = Math.max(score, 30);
        var start = Math.max(0, idx - 40);
        var end = Math.min(art.contenido.length, idx + query.length + 60);
        snippet = (start > 0 ? '...' : '') +
          art.contenido.substring(start, end) +
          (end < art.contenido.length ? '...' : '');
      }

      if (score > 0) {
        results.push({ art: art, score: score, snippet: snippet });
      }
    }

    results.sort(function (a, b) { return b.score - a.score; });
    var top = results.slice(0, 15);

    if (top.length === 0) {
      resultsDiv.innerHTML = '<div class="search-no-results">No se encontraron resultados para "' + escapeHtml(query) + '"</div>';
    } else {
      var html = '';
      for (var i = 0; i < top.length; i++) {
        var r = top[i];
        html += '<div class="search-result-item" data-article="' + r.art.id + '">';
        html += '<div class="search-result-num">Art. ' + r.art.numero + ' – ' + highlightMatch(escapeHtml(r.art.titulo), query) + '</div>';
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
    var hash = window.location.hash.substring(1);
    if (!hash) {
      showWelcome();
      return;
    }

    var parts = hash.split('/');
    var type = parts[0];
    var id = parts[1];

    if (type === 'articulo' && articleIndex[id]) {
      showArticle(id);
    } else if (type === 'capitulo') {
      showCapitulo(id);
    } else if (type === 'titulo') {
      showTitulo(id);
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
    var art = articleIndex[artId];
    if (!art) return;

    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('sectionView').style.display = 'none';
    document.getElementById('articleView').style.display = '';

    // Breadcrumb
    var bc = '<span class="breadcrumb-link" onclick="location.hash=\'\'">Inicio</span>';
    bc += '<span class="breadcrumb-sep">›</span>';
    bc += '<span>' + escapeHtml(art.libroTitulo) + '</span>';
    bc += '<span class="breadcrumb-sep">›</span>';
    bc += '<span class="breadcrumb-link" onclick="location.hash=\'#titulo/' + art.tituloId + '\'">' + escapeHtml(art.tituloTitulo) + '</span>';
    bc += '<span class="breadcrumb-sep">›</span>';
    bc += '<span class="breadcrumb-link" onclick="location.hash=\'#capitulo/' + art.capituloId + '\'">' + escapeHtml(art.capituloTitulo) + '</span>';
    if (art.seccionTitulo) {
      bc += '<span class="breadcrumb-sep">›</span>';
      bc += '<span>' + escapeHtml(art.seccionTitulo) + '</span>';
    }
    bc += '<span class="breadcrumb-sep">›</span>';
    bc += '<span>Art. ' + art.numero + '</span>';
    document.getElementById('breadcrumb').innerHTML = bc;

    // Article content
    var formatted = formatArticleBody(art.contenido);
    document.getElementById('articleContent').innerHTML =
      '<div class="article-header">' +
      '<div class="article-number">Artículo ' + art.numero + '</div>' +
      '<h2 class="article-title">' + escapeHtml(art.titulo) + '</h2>' +
      '</div>' +
      '<div class="article-body">' + formatted + '</div>';

    // Prev/Next nav
    var idx = allArticles.indexOf(art);
    var navHtml = '';
    if (idx > 0) {
      var prev = allArticles[idx - 1];
      navHtml += '<button class="article-nav-btn prev" onclick="location.hash=\'#articulo/' + prev.id + '\'">' +
        '<span>&#8592;</span><div><div class="nav-btn-label">Anterior</div>' +
        '<div class="nav-btn-title">Art. ' + prev.numero + ' – ' + escapeHtml(truncate(prev.titulo, 40)) + '</div></div></button>';
    }
    if (idx < allArticles.length - 1) {
      var next = allArticles[idx + 1];
      navHtml += '<button class="article-nav-btn next" onclick="location.hash=\'#articulo/' + next.id + '\'">' +
        '<div><div class="nav-btn-label">Siguiente</div>' +
        '<div class="nav-btn-title">Art. ' + next.numero + ' – ' + escapeHtml(truncate(next.titulo, 40)) + '</div></div><span>&#8594;</span></button>';
    }
    document.getElementById('articleNav').innerHTML = navHtml;

    // Expand nav tree and highlight
    expandNavTo(art);
    setActiveNav(artId);
    document.getElementById('mainContent').scrollTop = 0;
  }

  function showCapitulo(capId) {
    // Find capitulo data
    var capData = null, tituloData = null, libroData = null;
    for (var li = 0; li < codigoData.libros.length; li++) {
      var libro = codigoData.libros[li];
      for (var ti = 0; ti < libro.titulos.length; ti++) {
        var titulo = libro.titulos[ti];
        for (var ci = 0; ci < titulo.capitulos.length; ci++) {
          if (titulo.capitulos[ci].id === capId) {
            capData = titulo.capitulos[ci];
            tituloData = titulo;
            libroData = libro;
            break;
          }
        }
      }
    }
    if (!capData) return;

    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('articleView').style.display = 'none';
    document.getElementById('sectionView').style.display = '';

    document.getElementById('sectionBreadcrumb').innerHTML =
      '<span class="breadcrumb-link" onclick="location.hash=\'\'">Inicio</span>' +
      '<span class="breadcrumb-sep">›</span>' +
      '<span>' + escapeHtml('Libro ' + libroData.numero + ' – ' + libroData.titulo) + '</span>' +
      '<span class="breadcrumb-sep">›</span>' +
      '<span class="breadcrumb-link" onclick="location.hash=\'#titulo/' + tituloData.id + '\'">' +
      escapeHtml('Título ' + tituloData.numero + ' – ' + tituloData.titulo) + '</span>' +
      '<span class="breadcrumb-sep">›</span>' +
      '<span>' + escapeHtml('Capítulo ' + capData.numero) + '</span>';

    document.getElementById('sectionTitle').textContent =
      'Capítulo ' + capData.numero + ' – ' + capData.titulo;

    var html = '';

    // Direct articles
    if (capData.articulos.length > 0) {
      for (var i = 0; i < capData.articulos.length; i++) {
        html += renderArticleListItem(capData.articulos[i]);
      }
    }

    // Sections
    for (var si = 0; si < capData.secciones.length; si++) {
      var sec = capData.secciones[si];
      html += '<h3 class="section-subtitle">' +
        escapeHtml('Sección ' + sec.numero + ' – ' + sec.titulo) + '</h3>';
      for (var sai = 0; sai < sec.articulos.length; sai++) {
        html += renderArticleListItem(sec.articulos[sai]);
      }
    }

    document.getElementById('articlesList').innerHTML = html;
    document.getElementById('mainContent').scrollTop = 0;
  }

  function showTitulo(tituloId) {
    var tituloData = null, libroData = null;
    for (var li = 0; li < codigoData.libros.length; li++) {
      var libro = codigoData.libros[li];
      for (var ti = 0; ti < libro.titulos.length; ti++) {
        if (libro.titulos[ti].id === tituloId) {
          tituloData = libro.titulos[ti];
          libroData = libro;
          break;
        }
      }
    }
    if (!tituloData) return;

    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('articleView').style.display = 'none';
    document.getElementById('sectionView').style.display = '';

    document.getElementById('sectionBreadcrumb').innerHTML =
      '<span class="breadcrumb-link" onclick="location.hash=\'\'">Inicio</span>' +
      '<span class="breadcrumb-sep">›</span>' +
      '<span>' + escapeHtml('Libro ' + libroData.numero + ' – ' + libroData.titulo) + '</span>' +
      '<span class="breadcrumb-sep">›</span>' +
      '<span>' + escapeHtml('Título ' + tituloData.numero) + '</span>';

    document.getElementById('sectionTitle').textContent =
      'Título ' + tituloData.numero + ' – ' + tituloData.titulo;

    var html = '';
    for (var ci = 0; ci < tituloData.capitulos.length; ci++) {
      var cap = tituloData.capitulos[ci];
      html += '<h3 class="section-subtitle clickable" onclick="location.hash=\'#capitulo/' + cap.id + '\'">' +
        escapeHtml('Capítulo ' + cap.numero + ' – ' + cap.titulo) + '</h3>';

      // Show first few articles as preview
      var allCapArts = [];
      for (var ai = 0; ai < cap.articulos.length; ai++) {
        allCapArts.push(cap.articulos[ai]);
      }
      for (var si = 0; si < cap.secciones.length; si++) {
        for (var sai = 0; sai < cap.secciones[si].articulos.length; sai++) {
          allCapArts.push(cap.secciones[si].articulos[sai]);
        }
      }

      var show = Math.min(3, allCapArts.length);
      for (var i = 0; i < show; i++) {
        html += renderArticleListItem(allCapArts[i]);
      }
      if (allCapArts.length > 3) {
        html += '<div class="article-list-more" onclick="location.hash=\'#capitulo/' + cap.id + '\'">' +
          'Ver los ' + allCapArts.length + ' artículos del capítulo →</div>';
      }
    }

    document.getElementById('articlesList').innerHTML = html;
    document.getElementById('mainContent').scrollTop = 0;
  }

  function renderArticleListItem(art) {
    return '<div class="article-list-item" onclick="location.hash=\'#articulo/' + art.id + '\'">' +
      '<div><div class="article-list-num">Art. ' + art.numero + '</div></div>' +
      '<div><div class="article-list-title">' + escapeHtml(art.titulo) + '</div>' +
      '<div class="article-list-preview">' + escapeHtml(art.contenido.substring(0, 150)) + '...</div></div>' +
      '</div>';
  }

  // === Nav Helpers ===
  function expandNavTo(art) {
    // Expand titulo group
    var tGroup = document.querySelector('[data-titulo-group="' + art.tituloId + '"]');
    var tHeader = document.querySelector('[data-titulo="' + art.tituloId + '"]');
    if (tGroup) tGroup.classList.add('expanded');
    if (tHeader) tHeader.classList.add('expanded');

    // Expand capitulo group
    var cGroup = document.querySelector('[data-capitulo-group="' + art.capituloId + '"]');
    var cHeader = document.querySelector('[data-capitulo="' + art.capituloId + '"]');
    if (cGroup) cGroup.classList.add('expanded');
    if (cHeader) cHeader.classList.add('expanded');

    // Expand seccion group if applicable
    if (art.seccionId) {
      var sGroup = document.querySelector('[data-seccion-group="' + art.seccionId + '"]');
      var sHeader = document.querySelector('[data-seccion="' + art.seccionId + '"]');
      if (sGroup) sGroup.classList.add('expanded');
      if (sHeader) sHeader.classList.add('expanded');
    }
  }

  function setActiveNav(artId) {
    clearActiveNav();
    var link = document.querySelector('[data-article="' + artId + '"]');
    if (link) {
      link.classList.add('active');
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

  function truncate(str, maxLen) {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '…';
  }

  function formatArticleBody(text) {
    var lines = text.split('\n');
    var html = '';
    var inList = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      // Match numbered items: "1." or "1)" or "a)" patterns
      var matchDot = line.match(/^(\d+)\.\s+(.*)/);
      var matchParen = line.match(/^(\d+)\)\s*(.*)/);
      var match = matchDot || matchParen;

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
