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

// Lógica para videos (reproducción bajo demanda y pausa mutua)
const videoOverlays = document.querySelectorAll('.video-custom-overlay');

videoOverlays.forEach(overlay => {
    const videoId = overlay.getAttribute('data-video-id');
    const videoEl = document.getElementById(videoId);

    if (videoEl) {
        // Al hacer clic en la carátula/overlay
        overlay.addEventListener('click', () => {
            // Pausar cualquier otro video que esté reproduciéndose
            document.querySelectorAll('video').forEach(otherVideo => {
                if (otherVideo !== videoEl) {
                    otherVideo.pause();
                }
            });

            overlay.style.display = 'none';
            videoEl.play().catch(err => {
                console.error("Error al reproducir el video:", err);
            });
        });

        // Ocultar carátula si el usuario pulsa play en la barra de controles nativa
        videoEl.addEventListener('play', () => {
            overlay.style.display = 'none';
            document.querySelectorAll('video').forEach(otherVideo => {
                if (otherVideo !== videoEl) {
                    otherVideo.pause();
                }
            });
        });

        // Mostrar de nuevo la carátula si el video termina
        videoEl.addEventListener('ended', () => {
            overlay.style.display = 'flex';
        });
    }
});
