let allProducts = [];
let filteredProducts = [];
let currentPage = 1;
const itemsPerPage = 20;
let currentFilter = { type: "all" };
let currentSearchQuery = "";
let searchDebounceTimer = null;

// DOM Cache
const dom = {};

// Placeholder para productos sin imagen
function getNoImageHtml() {
    return '<div class="no-image-placeholder"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg><svg class="no-image-x" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>';
}

function showNoImage(imgEl) {
    imgEl.style.display = 'none';
    imgEl.parentElement.innerHTML = getNoImageHtml();
}

// --- Product Modal Logic ---
function openProductModal(index) {
    const prod = filteredProducts[index];
    if (!prod) return;
    
    const modal = document.getElementById('product-modal');
    
    // Rellenar imagen
    const imgContainer = document.getElementById('product-modal-image-container');
    const blacklistedImages = [
        'imagenes/imagen-074.webp', 'imagenes/imagen-075.webp',
        'imagenes/imagen-076.webp',
        'imagenes/imagen-128.webp', 'imagenes/imagen-129.webp',
        'imagenes/imagen-079.webp', 'imagenes/imagen-080.webp',
        'imagenes/imagen-078.webp', 'imagenes/imagen-081.webp'
    ];
    const hasValidImage = prod.imagen && prod.imagen.trim() !== '' && !blacklistedImages.includes(prod.imagen);
    if (hasValidImage) {
        imgContainer.innerHTML = `<img src="${prod.imagen}" alt="${escapeHtml(prod.producto)}" onerror="showNoImage(this)">`;
    } else {
        imgContainer.innerHTML = getNoImageHtml();
    }
    
    // Rellenar datos
    document.getElementById('product-modal-ref').textContent = prod.referencia ? `Ref: ${prod.referencia}` : '';
    document.getElementById('product-modal-title').textContent = prod.producto || 'Producto sin título';
    
    // Características (ignoramos las que empiezan por "campo_")
    const featuresList = document.getElementById('product-modal-features');
    const divider = document.getElementById('product-modal-divider');
    featuresList.innerHTML = '';
    let hasFeatures = false;
    
    if (prod.caracteristicas && typeof prod.caracteristicas === 'object') {
        Object.entries(prod.caracteristicas).forEach(([key, value]) => {
            if (!key.startsWith('campo_') && value && value.trim() !== '') {
                hasFeatures = true;
                const li = document.createElement('li');
                li.innerHTML = `<strong>${escapeHtml(key)}:</strong> <span>${escapeHtml(value)}</span>`;
                featuresList.appendChild(li);
            }
        });
    }
    
    if (divider) {
        divider.style.display = hasFeatures ? 'block' : 'none';
    }
    
    if (modal) modal.classList.add('show');
}

function setupImageModal() {
    const modal = document.getElementById('product-modal');
    const closeBtn = document.getElementById('product-modal-close');
    
    if (!modal) return;
    
    // Close on X button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('show');
        });
    }
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('product-modal-grid')) {
            modal.classList.remove('show');
        }
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            modal.classList.remove('show');
        }
    });
}

// --- Utilidades de Texto ---
function normalizeText(str) {
    if (!str) return "";
    return str
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/[^a-z0-9\s]/g, " ")    // Reemplazar símbolos por espacio
        .replace(/\s+/g, " ")            // Múltiples espacios → uno
        .trim();
}

// Crear un índice de texto buscable por producto (se genera una sola vez)
function buildSearchIndex(products) {
    return products.map(p => {
        // Concatenar todos los campos buscables en un solo string indexado
        const searchable = [
            p.producto,
            p.modelo,
            p.referencia,
            p.descripcion,
            p.categoria,
            p.subcategoria,
            p.categoriaPrincipal,
            // También indexar las características
            p.caracteristicas ? Object.values(p.caracteristicas).join(" ") : ""
        ].join(" ");
        
        return {
            product: p,
            searchText: normalizeText(searchable)
        };
    });
}

let searchIndex = [];

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', () => {
    dom.grid = document.getElementById('catalog-products-grid');
    if (!dom.grid) return;

    dom.prevBtn = document.getElementById('prev-page');
    dom.nextBtn = document.getElementById('next-page');
    dom.pageInfo = document.getElementById('page-info');
    dom.productCount = document.getElementById('product-count');
    dom.searchInput = document.getElementById('catalog-search-input');
    dom.catalogTitle = document.getElementById('catalog-title');

    try {
        const data = PRODUCTOS_DATA;
        allProducts = data.filter(p => p.categoriaPrincipal === "Extinción Mecánica");
        filteredProducts = [...allProducts];
        
        // Construir índice de búsqueda (una sola vez, rendimiento óptimo)
        searchIndex = buildSearchIndex(allProducts);
        
        buildSidebarFilters();
        
        // Comprobar si hay un parámetro de búsqueda en la URL (?q=...)
        const urlParams = new URLSearchParams(window.location.search);
        const queryFromUrl = urlParams.get('q');
        if (queryFromUrl && queryFromUrl.trim() !== "") {
            if (dom.searchInput) dom.searchInput.value = queryFromUrl;
            executeSearch(queryFromUrl);
        } else {
            renderPage();
        }
        
        setupSearch();
        setupImageModal();
    } catch (error) {
        console.error('Error al cargar el catálogo:', error);
        dom.grid.innerHTML = '<p class="error-msg" style="grid-column: 1/-1; color: red;">Error al cargar el catálogo. Por favor, revisa el archivo de productos.</p>';
    }
        
    // Paginación
    dom.prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderPage();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    
    dom.nextBtn.addEventListener('click', () => {
        const maxPage = Math.ceil(filteredProducts.length / itemsPerPage);
        if (currentPage < maxPage) {
            currentPage++;
            renderPage();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
});

// --- Motor de Búsqueda ---
function setupSearch() {
    if (!dom.searchInput) return;
    
    // Búsqueda en tiempo real con debounce (300ms)
    dom.searchInput.addEventListener('input', () => {
        const query = dom.searchInput.value.trim();
        
        // Debounce: esperar 300ms antes de buscar para no sobrecargar
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            if (query.length === 0) {
                clearSearch();
            } else {
                executeSearch(query);
            }
        }, 300);
    });
    
    // Tecla Escape limpia la búsqueda
    dom.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dom.searchInput.value = "";
            clearSearch();
        }
    });
}

function executeSearch(query) {
    currentSearchQuery = query;
    const normalizedQuery = normalizeText(query);
    
    // Dividir la búsqueda en palabras individuales (TODAS deben coincidir)
    const searchWords = normalizedQuery.split(" ").filter(w => w.length > 0);
    
    if (searchWords.length === 0) {
        clearSearch();
        return;
    }
    
    // Buscar: todas las palabras deben estar presentes en el texto indexado
    const results = searchIndex.filter(entry => {
        return searchWords.every(word => entry.searchText.includes(word));
    });
    
    filteredProducts = results.map(r => r.product);
    
    // Deseleccionar filtros del sidebar al buscar
    clearActiveFilters();
    closeAllSubmenus();
    
    // Actualizar título
    if (dom.catalogTitle) {
        dom.catalogTitle.innerHTML = `Resultados para: <span style="color: var(--primary-color);">"${escapeHtml(query)}"</span>`;
    }
    
    currentPage = 1;
    renderPage();
}

function clearSearch() {
    currentSearchQuery = "";
    
    // Restaurar al filtro activo anterior o "todos"
    if (currentFilter.type === "all") {
        filteredProducts = [...allProducts];
    } else if (currentFilter.type === "categoria") {
        filteredProducts = allProducts.filter(p => p.categoria === currentFilter.value);
    } else if (currentFilter.type === "subcategoria") {
        filteredProducts = allProducts.filter(p => p.categoria === currentFilter.cat && p.subcategoria === currentFilter.value);
    }
    
    if (dom.catalogTitle) {
        dom.catalogTitle.textContent = "Catálogo: Extinción Mecánica";
    }
    
    currentPage = 1;
    renderPage();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Sidebar Filtros (Acordeón) ---
function buildSidebarFilters() {
    const list = document.getElementById('subcategory-filter-list');
    if (!list) return;
    
    const catMap = {};
    allProducts.forEach(p => {
        const cat = p.categoria || "Sin categoría";
        const sub = p.subcategoria || "";
        if (!catMap[cat]) catMap[cat] = new Set();
        if (sub.trim() !== "") catMap[cat].add(sub);
    });
    
    const sortedCats = Object.keys(catMap).sort();
    
    let html = `<li>
        <button class="filter-btn filter-all active" data-type="all">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            Todos los productos
        </button>
    </li>`;
    
    sortedCats.forEach(cat => {
        const subs = Array.from(catMap[cat]).sort();
        const count = allProducts.filter(p => p.categoria === cat).length;
        
        html += `<li class="filter-group">
            <button class="filter-btn filter-category" data-type="categoria" data-value="${cat}">
                <span class="filter-cat-name">${cat}</span>
                <span class="filter-cat-meta">
                    <span class="filter-count">${count}</span>
                    <svg class="filter-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </span>
            </button>`;
        
        if (subs.length > 0) {
            html += `<ul class="filter-submenu">`;
            subs.forEach(sub => {
                const subCount = allProducts.filter(p => p.categoria === cat && p.subcategoria === sub).length;
                html += `<li>
                    <button class="filter-btn filter-sub" data-type="subcategoria" data-cat="${cat}" data-value="${sub}">
                        ${sub} <span class="filter-count">${subCount}</span>
                    </button>
                </li>`;
            });
            html += `</ul>`;
        }
        
        html += `</li>`;
    });
    
    list.innerHTML = html;
    
    // Eventos
    list.querySelector('.filter-all').addEventListener('click', (e) => {
        clearActiveFilters();
        e.currentTarget.classList.add('active');
        closeAllSubmenus();
        currentFilter = { type: "all" };
        filteredProducts = [...allProducts];
        currentSearchQuery = "";
        
        if (dom.searchInput) {
            dom.searchInput.value = "";
        }
        if (dom.catalogTitle) {
            dom.catalogTitle.textContent = "Catálogo: Extinción Mecánica";
        }
        currentPage = 1;
        renderPage();
    });
    
    list.querySelectorAll('.filter-category').forEach(btn => {
        btn.addEventListener('click', () => {
            const catValue = btn.getAttribute('data-value');
            const group = btn.closest('.filter-group');
            const submenu = group.querySelector('.filter-submenu');
            
            if (btn.classList.contains('active')) {
                if (submenu) submenu.classList.toggle('open');
                return;
            }
            
            clearActiveFilters();
            btn.classList.add('active');
            closeAllSubmenus();
            if (submenu) submenu.classList.add('open');
            
            currentFilter = { type: "categoria", value: catValue };
            filteredProducts = allProducts.filter(p => p.categoria === catValue);
            currentSearchQuery = "";
            
            if (dom.searchInput) {
                dom.searchInput.value = "";
            }
            if (dom.catalogTitle) {
                dom.catalogTitle.textContent = "Catálogo: " + catValue;
            }
            currentPage = 1;
            renderPage();
        });
    });
    
    list.querySelectorAll('.filter-sub').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const catValue = btn.getAttribute('data-cat');
            const subValue = btn.getAttribute('data-value');
            
            clearActiveFilters();
            btn.classList.add('active');
            const parentGroup = btn.closest('.filter-group');
            if (parentGroup) parentGroup.querySelector('.filter-category').classList.add('parent-active');
            
            currentFilter = { type: "subcategoria", value: subValue, cat: catValue };
            filteredProducts = allProducts.filter(p => p.categoria === catValue && p.subcategoria === subValue);
            currentSearchQuery = "";
            
            if (dom.searchInput) {
                dom.searchInput.value = "";
            }
            if (dom.catalogTitle) {
                dom.catalogTitle.textContent = subValue;
            }
            currentPage = 1;
            renderPage();
        });
    });
}

function clearActiveFilters() {
    document.querySelectorAll('#subcategory-filter-list .filter-btn').forEach(b => {
        b.classList.remove('active');
        b.classList.remove('parent-active');
    });
}

function closeAllSubmenus() {
    document.querySelectorAll('.filter-submenu').forEach(sm => sm.classList.remove('open'));
}

// --- Renderizado ---
function renderPage() {
    if (!dom.grid) return;
    
    const totalItems = filteredProducts.length;
    
    if (totalItems === 0) {
        let emptyMsg = 'No se encontraron productos.';
        if (currentSearchQuery) {
            emptyMsg = `No se encontraron productos para "<strong>${escapeHtml(currentSearchQuery)}</strong>". Prueba con otros términos.`;
        }
        dom.grid.innerHTML = `<div class="empty-search-state" style="grid-column: 1/-1;">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            <p>${emptyMsg}</p>
        </div>`;
        updatePagination(0);
        return;
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const pageProducts = filteredProducts.slice(startIndex, endIndex);
    
    // Imágenes genéricas de condiciones generales (no son del producto)
    const blacklistedImages = [
        'imagenes/imagen-074.webp', 'imagenes/imagen-075.webp',
        'imagenes/imagen-076.webp',
        'imagenes/imagen-128.webp', 'imagenes/imagen-129.webp',
        'imagenes/imagen-079.webp', 'imagenes/imagen-080.webp',
        'imagenes/imagen-078.webp', 'imagenes/imagen-081.webp'
    ];
    
    let html = '';
    pageProducts.forEach((prod, idx) => {
        const globalIndex = startIndex + idx;
        let titleHtml = escapeHtml(prod.producto);
        if (currentSearchQuery) {
            titleHtml = highlightMatch(prod.producto, currentSearchQuery);
        }
        
        const hasValidImage = prod.imagen && prod.imagen.trim() !== '' && !blacklistedImages.includes(prod.imagen);
        
        let imgHtml;
        if (hasValidImage) {
            imgHtml = `<img src="${prod.imagen}" alt="${prod.producto}" loading="lazy" onerror="showNoImage(this)">`;
        } else {
            imgHtml = getNoImageHtml();
        }
        
        html += `
            <div class="product-card">
                <div class="product-img-wrapper clickable-image" onclick="openProductModal(${globalIndex})">
                    ${imgHtml}
                </div>
                <div class="product-info">
                    <span class="product-ref">Ref: ${prod.referencia || 'N/D'}</span>
                    <h4 class="product-title">${titleHtml}</h4>
                </div>
            </div>
        `;
    });
    
    dom.grid.innerHTML = html;
    
    if (dom.productCount) {
        dom.productCount.textContent = `${totalItems} producto${totalItems !== 1 ? 's' : ''}`;
    }
    updatePagination(totalItems);
}

// Resaltar coincidencias de búsqueda en el texto
function highlightMatch(text, query) {
    if (!text || !query) return escapeHtml(text);
    
    const words = query.trim().split(/\s+/).filter(w => w.length > 0);
    let result = escapeHtml(text);
    
    words.forEach(word => {
        const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        result = result.replace(regex, '<mark class="search-highlight">$1</mark>');
    });
    
    return result;
}

// --- Paginación ---
function updatePagination(totalItems) {
    const maxPage = Math.ceil(totalItems / itemsPerPage) || 1;
    
    if (dom.pageInfo) {
        dom.pageInfo.textContent = `Página ${currentPage} de ${maxPage}`;
    }
    
    if (dom.prevBtn) dom.prevBtn.disabled = currentPage === 1;
    if (dom.nextBtn) dom.nextBtn.disabled = currentPage === maxPage || totalItems === 0;
}
