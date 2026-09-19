/**
 * Kursal Sistemas - Contact Form Logic & Security Handler
 * Implements: Rate Limiting, Bot-Trap (Honeypot), Submission Time Analysis, 
 * Strict Input Validation, and XSS Sanitization.
 */

(function () {
    'use strict';

    // --- Configuración de Seguridad ---
    const SECURITY_CONFIG = {
        MAX_SUBMISSIONS: 2,           // Máximo de envíos permitidos
        WINDOW_SECONDS: 300,          // Ventana de tiempo (5 minutos = 300s)
        MIN_SUBMISSION_TIME_MS: 2500, // Tiempo mínimo para rellenar (evita bots inmediatos)
        STORAGE_KEY: 'kursal_sec_rl_timestamps'
    };

    const formInitTime = Date.now();
    let cooldownTimerInterval = null;

    // --- DOM Elements ---
    const form = document.getElementById('kursal-contact-form');
    if (!form) return;

    const nameInput = document.getElementById('contact-name');
    const companyInput = document.getElementById('contact-company');
    const emailInput = document.getElementById('contact-email');
    const phoneInput = document.getElementById('contact-phone');
    const subjectSelect = document.getElementById('contact-subject');
    const messageTextarea = document.getElementById('contact-message');
    const rgpdCheckbox = document.getElementById('contact-rgpd');
    const honeypotInput = document.getElementById('b_field_kursal');
    const charCounter = document.getElementById('char-counter');
    const statusAlert = document.getElementById('form-status-alert');
    const submitBtn = document.getElementById('btn-submit-contact');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnIcon = submitBtn.querySelector('.btn-icon');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');
    const successCard = document.getElementById('form-success-card');
    const successRefCode = document.getElementById('success-ref-code');
    const resetBtn = document.getElementById('btn-reset-form');

    // --- Utilidades de Seguridad y Sanitización ---
    function sanitizeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .trim();
    }

    function isValidEmail(email) {
        const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
        return regex.test(email);
    }

    function isValidPhone(phone) {
        const clean = phone.replace(/[\s\-\(\)\.]/g, '');
        // Permite números de 9 o más dígitos, con o sin prefijo '+'
        const regex = /^\+?[0-9]{9,15}$/;
        return regex.test(clean);
    }

    // --- Gestión de Rate Limiting (Límite de envíos) ---
    function getStoredTimestamps() {
        try {
            const raw = localStorage.getItem(SECURITY_CONFIG.STORAGE_KEY);
            if (!raw) return [];
            const timestamps = JSON.parse(raw);
            const now = Date.now();
            const windowMs = SECURITY_CONFIG.WINDOW_SECONDS * 1000;
            // Filtrar solo timestamps dentro de la ventana de tiempo
            return timestamps.filter(ts => (now - ts) < windowMs);
        } catch (e) {
            return [];
        }
    }

    function recordSubmission() {
        try {
            const timestamps = getStoredTimestamps();
            timestamps.push(Date.now());
            localStorage.setItem(SECURITY_CONFIG.STORAGE_KEY, JSON.stringify(timestamps));
        } catch (e) {}
    }

    function checkRateLimit() {
        const timestamps = getStoredTimestamps();
        if (timestamps.length >= SECURITY_CONFIG.MAX_SUBMISSIONS) {
            const oldestInWindow = timestamps[0];
            const now = Date.now();
            const elapsed = Math.floor((now - oldestInWindow) / 1000);
            const remaining = SECURITY_CONFIG.WINDOW_SECONDS - elapsed;
            return { limited: true, remainingSeconds: Math.max(1, remaining) };
        }
        return { limited: false, remainingSeconds: 0 };
    }

    function startCooldown(remainingSeconds) {
        clearInterval(cooldownTimerInterval);
        submitBtn.disabled = true;
        
        function updateUI(secs) {
            showAlert(`🔒 <strong>Límite de seguridad alcanzado:</strong> Para prevenir envíos automatizados, por favor espera <strong>${secs}s</strong> antes de enviar otra solicitud.`, 'warning');
            btnText.textContent = `Espera ${secs}s...`;
        }

        let currentSecs = remainingSeconds;
        updateUI(currentSecs);

        cooldownTimerInterval = setInterval(() => {
            currentSecs--;
            if (currentSecs <= 0) {
                clearInterval(cooldownTimerInterval);
                submitBtn.disabled = false;
                btnText.textContent = 'Enviar Solicitud';
                hideAlert();
            } else {
                updateUI(currentSecs);
            }
        }, 1000);
    }

    // --- UI Alerts & Validation Errors ---
    function showAlert(html, type = 'error') {
        statusAlert.innerHTML = html;
        statusAlert.className = `form-status-alert alert-${type}`;
        statusAlert.style.display = 'block';
    }

    function hideAlert() {
        statusAlert.style.display = 'none';
        statusAlert.innerHTML = '';
    }

    function clearFieldError(elementId) {
        const el = document.getElementById(elementId);
        if (el) el.textContent = '';
    }

    function setFieldError(elementId, message) {
        const el = document.getElementById(elementId);
        if (el) el.textContent = message;
    }

    function clearAllErrors() {
        ['error-name', 'error-email', 'error-phone', 'error-subject', 'error-message', 'error-rgpd'].forEach(clearFieldError);
        hideAlert();
    }

    // --- Contador de Caracteres en Vivo ---
    if (messageTextarea && charCounter) {
        messageTextarea.addEventListener('input', () => {
            const len = messageTextarea.value.length;
            charCounter.textContent = `${len} / 2000`;
            if (len > 1900) {
                charCounter.style.color = '#e74c3c';
            } else {
                charCounter.style.color = 'var(--text-muted)';
            }
            clearFieldError('error-message');
        });
    }

    // Limpiar errores mientras el usuario escribe
    if (nameInput) nameInput.addEventListener('input', () => clearFieldError('error-name'));
    if (emailInput) emailInput.addEventListener('input', () => clearFieldError('error-email'));
    if (phoneInput) phoneInput.addEventListener('input', () => clearFieldError('error-phone'));
    if (subjectSelect) subjectSelect.addEventListener('change', () => clearFieldError('error-subject'));
    if (rgpdCheckbox) rgpdCheckbox.addEventListener('change', () => clearFieldError('error-rgpd'));

    // --- Inicialización y Comprobación de Rate Limit al cargar ---
    const initialRateCheck = checkRateLimit();
    if (initialRateCheck.limited) {
        startCooldown(initialRateCheck.remainingSeconds);
    }

    // --- Envío del Formulario ---
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        clearAllErrors();

        // 1. Verificación Rate Limit
        const rateCheck = checkRateLimit();
        if (rateCheck.limited) {
            startCooldown(rateCheck.remainingSeconds);
            return;
        }

        // 2. Verificación Honeypot (Trampa Anti-Bot)
        if (honeypotInput && honeypotInput.value.trim() !== '') {
            // Es un bot automatizado que rellenó el campo oculto
            console.warn('Bot submission blocked via honeypot.');
            showAlert('Tu envío no ha podido ser procesado por seguridad.', 'error');
            return;
        }

        // 3. Verificación de Tiempo de Rellenado (Time-trap)
        const timeElapsed = Date.now() - formInitTime;
        if (timeElapsed < SECURITY_CONFIG.MIN_SUBMISSION_TIME_MS) {
            showAlert('Por favor, tómate un momento para revisar los datos antes de enviar.', 'warning');
            return;
        }

        // 4. Extracción y Sanitización de Campos
        const name = sanitizeHtml(nameInput.value);
        const company = sanitizeHtml(companyInput.value);
        const email = sanitizeHtml(emailInput.value);
        const phone = sanitizeHtml(phoneInput.value);
        const subject = sanitizeHtml(subjectSelect.value);
        const message = sanitizeHtml(messageTextarea.value);
        const acceptedRgpd = rgpdCheckbox.checked;

        // 5. Validación de Campos
        let hasErrors = false;

        if (!name || name.length < 3) {
            setFieldError('error-name', 'Por favor, introduce tu nombre completo.');
            hasErrors = true;
        }

        if (!email || !isValidEmail(email)) {
            setFieldError('error-email', 'Introduce un correo electrónico válido.');
            hasErrors = true;
        }

        if (!phone || !isValidPhone(phone)) {
            setFieldError('error-phone', 'Introduce un número de teléfono válido.');
            hasErrors = true;
        }

        if (!subject) {
            setFieldError('error-subject', 'Selecciona el asunto o catálogo de tu interés.');
            hasErrors = true;
        }

        if (!message || message.length < 15) {
            setFieldError('error-message', 'El mensaje debe tener al menos 15 caracteres descriptivos.');
            hasErrors = true;
        }

        if (!acceptedRgpd) {
            setFieldError('error-rgpd', 'Debes aceptar la política de privacidad para continuar.');
            hasErrors = true;
        }

        if (hasErrors) {
            showAlert('Por favor, revisa los campos marcados en rojo.', 'error');
            return;
        }

        // 6. Proceso de Envío Seguro (Simulado / Asíncrono)
        submitBtn.disabled = true;
        btnText.textContent = 'Procesando envío seguro...';
        btnIcon.style.display = 'none';
        btnSpinner.style.display = 'inline-block';

        const payload = {
            id: 'KS-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random() * 899 + 100),
            timestamp: new Date().toISOString(),
            nombre: name,
            empresa: company || 'No especificada',
            email: email,
            telefono: phone,
            asunto: subject,
            mensaje: message
        };

        try {
            // Simulamos latencia de red segura y verificación de token
            await new Promise(resolve => setTimeout(resolve, 1200));

            // Guardar registro de rate limit
            recordSubmission();

            // Mostrar estado de éxito
            form.style.display = 'none';
            if (successRefCode) {
                successRefCode.textContent = payload.id;
            }
            if (successCard) {
                successCard.style.display = 'block';
                successCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            // Comprobar si ahora entra en rate limit para futuros envíos
            const postCheck = checkRateLimit();
            if (postCheck.limited) {
                startCooldown(postCheck.remainingSeconds);
            }

        } catch (err) {
            console.error('Error al enviar:', err);
            showAlert('Hubo un problema al procesar tu solicitud. Por favor intenta de nuevo.', 'error');
            submitBtn.disabled = false;
            btnText.textContent = 'Enviar Solicitud';
            btnIcon.style.display = 'inline-block';
            btnSpinner.style.display = 'none';
        }
    });

    // --- Botón de Reset para enviar otra consulta ---
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            form.reset();
            if (charCounter) charCounter.textContent = '0 / 2000';
            clearAllErrors();
            successCard.style.display = 'none';
            form.style.display = 'block';
            submitBtn.disabled = false;
            btnText.textContent = 'Enviar Solicitud';
            btnIcon.style.display = 'inline-block';
            btnSpinner.style.display = 'none';

            const check = checkRateLimit();
            if (check.limited) {
                startCooldown(check.remainingSeconds);
            }
        });
    }

})();
