// Lógica principal de la página
console.log("Kursal Web iniciada correctamente.");

// Lógica para abrir y cerrar el Sidebar Drawer de marcas
const openDrawerBtn = document.getElementById('openDrawerBtn');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');
const brandsDrawer = document.getElementById('brandsDrawer');
const drawerOverlay = document.querySelector('.drawer-overlay');

if (openDrawerBtn && closeDrawerBtn && brandsDrawer) {
    // Abrir Drawer
    openDrawerBtn.addEventListener('click', () => {
        brandsDrawer.classList.add('active');
        document.body.style.overflow = 'hidden'; // Evita scroll de fondo
    });

    // Cerrar Drawer
    const closeDrawer = () => {
        brandsDrawer.classList.remove('active');
        document.body.style.overflow = ''; // Restaura scroll
    };

    closeDrawerBtn.addEventListener('click', closeDrawer);
    if (drawerOverlay) {
        drawerOverlay.addEventListener('click', closeDrawer);
    }
}

// Lógica para el video promocional (ocultar overlay al reproducir)
const videoOverlay = document.getElementById('videoOverlay');
const mainVideo = document.getElementById('mainVideo');

if (videoOverlay && mainVideo) {
    videoOverlay.addEventListener('click', () => {
        const source = mainVideo.querySelector('source');
        // Comprobar si el source tiene un enlace real definido
        if (source && source.getAttribute('src') && source.getAttribute('src').trim() !== "") {
            videoOverlay.style.display = 'none';
            mainVideo.play().catch(err => {
                console.error("Error al reproducir el video:", err);
            });
        } else {
            alert("El enlace del video aún no está configurado. Añade la URL del archivo de video en la etiqueta <source src='...'> del index.html.");
        }
    });

    // Ocultar overlay automáticamente si el video es reproducido externamente (controles nativos)
    mainVideo.addEventListener('play', () => {
        videoOverlay.style.display = 'none';
    });
}
