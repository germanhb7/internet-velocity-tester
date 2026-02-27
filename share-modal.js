function buildShareText() {
    const download = document.getElementById('download')?.textContent || '0.00';
    const upload = document.getElementById('upload')?.textContent || '0.00';
    const ping = document.getElementById('ping')?.textContent || '0';
    const stability = document.getElementById('stability')?.textContent || '0';

    return [
        'Resultado de test de internet',
        `Descarga: ${download} Mbps`,
        `Subida: ${upload} Mbps`,
        `Ping: ${ping} ms`,
        `Estabilidad: ${stability}%`,
        `Fecha: ${new Date().toLocaleDateString('es-AR')}`
    ].join('\n');
}

function openShareModal() {
    const modal = document.getElementById('share-modal');
    if (!modal) return;

    const summary = document.getElementById('share-summary');
    if (summary) {
        summary.textContent = buildShareText().replace(/\n/g, ' · ');
    }

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
}

function closeShareModal() {
    const modal = document.getElementById('share-modal');
    if (!modal) return;

    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
}

async function copyShareSummary() {
    const text = buildShareText();

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const area = document.createElement('textarea');
            area.value = text;
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            document.body.removeChild(area);
        }
    } catch {
        alert("No se pudo copiar el texto");
    }
}

function initShareModal() {
    const openButton = document.getElementById('share-btn');
    const closeButton = document.getElementById('share-close-btn');
    const copyButton = document.getElementById('share-copy-btn');
    const modal = document.getElementById('share-modal');

    if (openButton) openButton.onclick = openShareModal;
    if (closeButton) closeButton.onclick = closeShareModal;

    if (copyButton) {
        copyButton.onclick = async () => {
            await copyShareSummary();
            copyButton.textContent = 'Copiado ✅';
            setTimeout(() => {
                copyButton.textContent = 'Copiar resumen';
            }, 1200);
        };
    }

    if (modal) {
        modal.onclick = (event) => {
            if (event.target === modal) closeShareModal();
        };
    }
}

// Esperar SIEMPRE a que cargue el HTML
window.addEventListener('load', initShareModal);