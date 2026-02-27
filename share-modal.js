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

    if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    document.body.removeChild(area);
}

function initShareModal() {
    const openButton = document.getElementById('share-btn');
    const closeButton = document.getElementById('close-share');
    const copyButton = document.getElementById('share-copy-btn');
    const modal = document.getElementById('share-modal');

    if (openButton) {
        openButton.addEventListener('click', openShareModal);
    }

    if (closeButton) {
        closeButton.addEventListener('click', closeShareModal);
    }

    if (copyButton) {
        copyButton.addEventListener('click', async () => {
            try {
                await copyShareSummary();
                copyButton.textContent = 'Copiado ✅';
                setTimeout(() => {
                    copyButton.textContent = 'Copiar resumen';
                }, 1200);
            } catch {
                copyButton.textContent = 'No se pudo copiar';
            }
        });
    }

    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeShareModal();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', initShareModal);
