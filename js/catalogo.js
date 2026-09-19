let allProducts = [];
let filteredProducts = [];
let currentPage = 1;
const itemsPerPage = 20;
let currentFilter = { type: "all" };
let currentSearchQuery = "";
let searchDebounceTimer = null;

let currentPrincipal = "Extinción Mecánica";
let isGlobal = false;

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
    const hasValidImage = prod.imagen && prod.imagen.trim() !== '';
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
            if (!key.startsWith('campo_') && value && String(value).trim() !== '') {
                hasFeatures = true;
                const li = document.createElement('li');
                if (key.startsWith('Especificación') || key.startsWith('—') || key.startsWith('-') || key.startsWith('–') || /^\d+$/.test(key)) {
                    li.innerHTML = `<span style="color: var(--primary-color); font-weight: bold; margin-right: 0.35rem;">—</span><span>${escapeHtml(value)}</span>`;
                } else {
                    li.innerHTML = `<strong>${escapeHtml(key)}:</strong> <span>${escapeHtml(value)}</span>`;
                }
                featuresList.appendChild(li);
            }
        });
    }
    
    if (divider) {
        divider.style.display = hasFeatures ? 'block' : 'none';
    }

    const actionContainer = document.getElementById('product-modal-action-container');
    if (actionContainer) {
        actionContainer.style.display = (prod.categoriaPrincipal === "Grupos PCI") ? "block" : "none";
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

// --- Utilidades de Texto y Búsqueda Avanzada ---
function normalizeText(str) {
    if (!str) return "";
    return str
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Quitar acentos y diacríticos
        .replace(/([0-9]+)([a-zA-Z]+)/g, "$1 $2") // Separar números pegados a letras (ej: 6kg -> 6 kg, dn50 -> dn 50)
        .replace(/([a-zA-Z]+)([0-9]+)/g, "$1 $2") // Separar letras pegadas a números (ej: ip67 -> ip 67)
        .replace(/[^a-z0-9\s]/g, " ")             // Reemplazar símbolos y puntuación por espacios
        .replace(/\s+/g, " ")                     // Múltiples espacios a uno solo
        .trim();
}

// Crear un índice estructurado por producto con campos ponderados
function buildSearchIndex(products) {
    return products.map(p => {
        const ref = normalizeText(p.referencia || "");
        const title = normalizeText(p.producto || "");
        const model = normalizeText(p.modelo || "");
        const cat = normalizeText(p.categoria || "");
        const subcat = normalizeText(p.subcategoria || "");
        const princ = normalizeText(p.categoriaPrincipal || "");
        const desc = normalizeText(p.descripcion || "");
        const feats = normalizeText(p.caracteristicas ? Object.values(p.caracteristicas).join(" ") : "");
        const norma = normalizeText(p.norma || "");

        // Añadir alias comunes (ej: Ebara para Grupos PCI)
        const aliases = (p.categoriaPrincipal === "Grupos PCI") ? "ebara bomba bombeo grupo pci" : "";

        const fullText = `${ref} ${title} ${model} ${cat} ${subcat} ${princ} ${desc} ${feats} ${norma} ${aliases}`;

        return {
            product: p,
            ref,
            title,
            model,
            cat,
            subcat,
            princ,
            desc,
            feats,
            norma,
            aliases,
            fullText
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
        const urlParams = new URLSearchParams(window.location.search);
        const catParam = urlParams.get('cat') || urlParams.get('catalogo') || '';
        
        if (catParam.toLowerCase().includes('pci') || catParam.toLowerCase().includes('grupo')) {
            currentPrincipal = "Grupos PCI";
            isGlobal = false;
        } else if (catParam.toLowerCase().includes('detec')) {
            currentPrincipal = "Detección";
            isGlobal = false;
        } else if (catParam.toLowerCase().includes('campana') || catParam.toLowerCase().includes('cocina')) {
            currentPrincipal = "Extinción Campanas de Cocina";
            isGlobal = false;
        } else if (catParam.toLowerCase().includes('extincion') || catParam.toLowerCase().includes('mecanica')) {
            currentPrincipal = "Extinción Mecánica";
            isGlobal = false;
        } else {
            currentPrincipal = "Todos los Catálogos";
            isGlobal = true;
        }

        const data = PRODUCTOS_DATA;
        if (isGlobal) {
            allProducts = [...data];
        } else {
            allProducts = data.filter(p => p.categoriaPrincipal === currentPrincipal);
        }
        filteredProducts = [...allProducts];
        
        // Construir índice de búsqueda (una sola vez, rendimiento óptimo)
        searchIndex = buildSearchIndex(allProducts);
        
        buildSidebarFilters();
        
        if (dom.catalogTitle) {
            dom.catalogTitle.textContent = isGlobal ? "Catálogo General" : "Catálogo: " + currentPrincipal;
        }

        const ebaraBanner = document.getElementById('ebara-banner');
        if (ebaraBanner) {
            ebaraBanner.style.display = currentPrincipal === "Grupos PCI" ? "flex" : "none";
        }
        
        // Comprobar si hay un parámetro de búsqueda en la URL (?q=...)
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
    
    // Ponderación de relevancia
    const scoredResults = [];
    
    for (let i = 0; i < searchIndex.length; i++) {
        const item = searchIndex[i];
        
        // Comprobación de inclusión estricta: todas las palabras deben existir en la ficha del producto
        const matchesAllWords = searchWords.every(word => item.fullText.includes(word));
        if (!matchesAllWords) continue;
        
        let score = 0;
        
        // 1. Coincidencia de frase exacta en campos clave (máxima prioridad)
        if (item.ref && item.ref.includes(normalizedQuery)) score += 200;
        if (item.model && item.model.includes(normalizedQuery)) score += 150;
        if (item.title && item.title.includes(normalizedQuery)) score += 100;
        if (item.subcat && item.subcat.includes(normalizedQuery)) score += 80;
        if (item.cat && item.cat.includes(normalizedQuery)) score += 70;
        if (item.princ && item.princ.includes(normalizedQuery)) score += 50;
        
        // 2. Coincidencia palabra por palabra según jerarquía de campos
        for (let j = 0; j < searchWords.length; j++) {
            const word = searchWords[j];
            
            // Referencia exacta o contenida
            if (item.ref === word) score += 120;
            else if (item.ref.split(" ").includes(word)) score += 70;
            else if (item.ref.includes(word)) score += 35;
            
            // Modelo
            if (item.model.split(" ").includes(word)) score += 60;
            else if (item.model.includes(word)) score += 30;
            
            // Título / Nombre del producto
            if (item.title.split(" ").includes(word)) score += 50;
            else if (item.title.includes(word)) score += 25;
            
            // Subcategoría y Categoría
            if (item.subcat.split(" ").includes(word)) score += 35;
            else if (item.subcat.includes(word)) score += 18;
            
            if (item.cat.split(" ").includes(word)) score += 30;
            else if (item.cat.includes(word)) score += 15;

            // Alias
            if (item.aliases && item.aliases.includes(word)) score += 25;
            
            // Descripción y características (peso menor para no desplazar productos principales)
            if (item.desc.split(" ").includes(word)) score += 5;
            else if (item.desc.includes(word)) score += 2;
            
            if (item.feats.split(" ").includes(word)) score += 3;
            else if (item.feats.includes(word)) score += 1;
        }
        
        scoredResults.push({ score, product: item.product });
    }
    
    // Ordenar resultados de mayor a menor relevancia
    scoredResults.sort((a, b) => b.score - a.score);
    
    filteredProducts = scoredResults.map(r => r.product);
    
    // Deseleccionar filtros del sidebar al buscar
    clearActiveFilters();
    closeAllSubmenus();
    
    // Actualizar título
    if (dom.catalogTitle) {
        dom.catalogTitle.innerHTML = `Resultados para: <span style="color: var(--primary-color);">"${escapeHtml(query)}"</span> (${filteredProducts.length})`;
    }
    
    currentPage = 1;
    renderPage();
}

function clearSearch() {
    currentSearchQuery = "";
    
    // Restaurar al filtro activo anterior o "todos"
    if (currentFilter.type === "all") {
        filteredProducts = [...allProducts];
    } else if (currentFilter.type === "principal") {
        filteredProducts = allProducts.filter(p => p.categoriaPrincipal === currentFilter.value);
    } else if (currentFilter.type === "categoria") {
        if (isGlobal && currentFilter.princ) {
            filteredProducts = allProducts.filter(p => p.categoriaPrincipal === currentFilter.princ && p.categoria === currentFilter.value);
        } else {
            filteredProducts = allProducts.filter(p => p.categoria === currentFilter.value);
        }
    } else if (currentFilter.type === "subcategoria") {
        filteredProducts = allProducts.filter(p => p.categoria === currentFilter.cat && p.subcategoria === currentFilter.value);
    }
    
    if (dom.catalogTitle) {
        if (currentFilter.type === "all") {
            dom.catalogTitle.textContent = isGlobal ? "Catálogo General" : "Catálogo: " + currentPrincipal;
        } else {
            dom.catalogTitle.textContent = currentFilter.value;
        }
    }
    
    currentPage = 1;
    renderPage();
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- Sidebar Filtros (Acordeón) ---
function buildSidebarFilters() {
    const list = document.getElementById('subcategory-filter-list');
    if (!list) return;
    
    let html = `<li>
        <button class="filter-btn filter-all active" data-type="all">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            Todos los productos
        </button>
    </li>`;

    if (isGlobal) {
        const principalMap = {};
        allProducts.forEach(p => {
            const princ = p.categoriaPrincipal || "Otros";
            const cat = p.categoria || "General";
            if (!principalMap[princ]) principalMap[princ] = new Set();
            if (cat.trim() !== "") principalMap[princ].add(cat);
        });

        const sortedPrincipals = Object.keys(principalMap);
        sortedPrincipals.forEach(princ => {
            const cats = Array.from(principalMap[princ]).sort();
            const count = allProducts.filter(p => p.categoriaPrincipal === princ).length;

            html += `<li class="filter-group">
                <button class="filter-btn filter-category" data-type="principal" data-value="${escapeHtml(princ)}">
                    <span class="filter-cat-name">${escapeHtml(princ)}</span>
                    <span class="filter-cat-meta">
                        <span class="filter-count">${count}</span>
                        <svg class="filter-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </span>
                </button>`;

            if (cats.length > 0) {
                html += `<ul class="filter-submenu">`;
                cats.forEach(cat => {
                    const catCount = allProducts.filter(p => p.categoriaPrincipal === princ && p.categoria === cat).length;
                    html += `<li>
                        <button class="filter-btn filter-sub" data-type="categoria" data-princ="${escapeHtml(princ)}" data-value="${escapeHtml(cat)}">
                            <span class="filter-sub-name">${escapeHtml(cat)}</span>
                            <span class="filter-count">${catCount}</span>
                        </button>
                    </li>`;
                });
                html += `</ul>`;
            }

            html += `</li>`;
        });
    } else {
        const catMap = {};
        allProducts.forEach(p => {
            const cat = p.categoria || "Sin categoría";
            const sub = p.subcategoria || "";
            if (!catMap[cat]) catMap[cat] = new Set();
            if (sub.trim() !== "") catMap[cat].add(sub);
        });
        
        const sortedCats = Object.keys(catMap).sort();
        sortedCats.forEach(cat => {
            const subs = Array.from(catMap[cat]).sort();
            const count = allProducts.filter(p => p.categoria === cat).length;
            
            html += `<li class="filter-group">
                <button class="filter-btn filter-category" data-type="categoria" data-value="${escapeHtml(cat)}">
                    <span class="filter-cat-name">${escapeHtml(cat)}</span>
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
                        <button class="filter-btn filter-sub" data-type="subcategoria" data-cat="${escapeHtml(cat)}" data-value="${escapeHtml(sub)}">
                            <span class="filter-sub-name">${escapeHtml(sub)}</span>
                            <span class="filter-count">${subCount}</span>
                        </button>
                    </li>`;
                });
                html += `</ul>`;
            }
            
            html += `</li>`;
        });
    }

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
            dom.catalogTitle.textContent = isGlobal ? "Catálogo General" : "Catálogo: " + currentPrincipal;
        }
        currentPage = 1;
        renderPage();
    });
    
    list.querySelectorAll('.filter-category').forEach(btn => {
        btn.addEventListener('click', () => {
            const filterType = btn.getAttribute('data-type');
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
            
            if (filterType === 'principal') {
                currentFilter = { type: "principal", value: catValue };
                filteredProducts = allProducts.filter(p => p.categoriaPrincipal === catValue);
            } else {
                currentFilter = { type: "categoria", value: catValue };
                filteredProducts = allProducts.filter(p => p.categoria === catValue);
            }
            currentSearchQuery = "";
            
            if (dom.searchInput) {
                dom.searchInput.value = "";
            }
            if (dom.catalogTitle) {
                dom.catalogTitle.textContent = catValue;
            }
            currentPage = 1;
            renderPage();
        });
    });
    
    list.querySelectorAll('.filter-sub').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const filterType = btn.getAttribute('data-type');
            const subValue = btn.getAttribute('data-value');
            
            clearActiveFilters();
            btn.classList.add('active');
            const parentGroup = btn.closest('.filter-group');
            if (parentGroup) parentGroup.querySelector('.filter-category').classList.add('parent-active');
            
            if (filterType === 'categoria') {
                const princValue = btn.getAttribute('data-princ');
                currentFilter = { type: "categoria", value: subValue, princ: princValue };
                filteredProducts = allProducts.filter(p => p.categoriaPrincipal === princValue && p.categoria === subValue);
            } else {
                const catValue = btn.getAttribute('data-cat');
                currentFilter = { type: "subcategoria", value: subValue, cat: catValue };
                filteredProducts = allProducts.filter(p => p.categoria === catValue && p.subcategoria === subValue);
            }
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
    
    let html = '';
    pageProducts.forEach((prod, idx) => {
        const globalIndex = startIndex + idx;
        let titleHtml = escapeHtml(prod.producto);
        if (currentSearchQuery) {
            titleHtml = highlightMatch(prod.producto, currentSearchQuery);
        }
        
        const hasValidImage = prod.imagen && prod.imagen.trim() !== '';
        
        let imgHtml;
        if (hasValidImage) {
            imgHtml = `<img src="${escapeHtml(prod.imagen)}" alt="${escapeHtml(prod.producto)}" loading="lazy" onerror="showNoImage(this)">`;
        } else {
            imgHtml = getNoImageHtml();
        }
        
        let badgeClass = 'badge-deteccion';
        if (prod.categoriaPrincipal === 'Extinción Mecánica') badgeClass = 'badge-extincion';
        else if (prod.categoriaPrincipal === 'Grupos PCI') badgeClass = 'badge-grupos';
        else if (prod.categoriaPrincipal === 'Extinción Campanas de Cocina') badgeClass = 'badge-campanas';

        const badgeHtml = isGlobal ? `<span class="catalog-badge ${badgeClass}">${escapeHtml(prod.categoriaPrincipal)}</span>` : '';
        
        html += `
            <div class="product-card">
                <div class="product-img-wrapper clickable-image" onclick="openProductModal(${globalIndex})">
                    ${imgHtml}
                </div>
                <div class="product-info">
                    <div class="product-meta-header">
                        <span class="product-ref">Ref: ${escapeHtml(prod.referencia) || 'N/D'}</span>
                        ${badgeHtml}
                    </div>
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
