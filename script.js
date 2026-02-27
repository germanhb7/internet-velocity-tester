// Configuración principal del tester
const HISTORY_KEY = 'internetVelocityHistory';
const LIBRESPEED_EMPTY = 'https://librespeed.org/backend/empty.php';
const LIBRESPEED_GARBAGE = 'https://librespeed.org/backend/garbage.php';
const DOWNLOAD_SAMPLE_BYTES = [750000, 1500000, 2500000];
const UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

let userCountry = '-';
let userISP = '-';
let isInterviewMode = false;

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value || '-';
}

function showConnectionError() {
    setText('ip', '-');
    setText('isp', '-');
    setText('city', '-');
    setText('country', '-');
    setText('asn', '-');
    setText('isp-result', '-');
}

function formatNumber(value, decimals = 2) {
    return Number.isFinite(value) ? value.toFixed(decimals) : '0.00';
}

function getSpeedClassification(downloadMbps) {
    if (downloadMbps < 10) return 'Lenta';
    if (downloadMbps < 50) return 'Normal';
    if (downloadMbps < 200) return 'Rápida';
    return 'Profesional';
}

function safeReadHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch {
        return [];
    }
}

function safeWriteHistory(items) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    } catch {
        // Evita romper UI si localStorage está bloqueado.
    }
}

function renderHistory() {
    const historyList = document.getElementById('history-list');
    if (!historyList) return;

    const entries = safeReadHistory();
    if (!entries.length) {
        historyList.innerHTML = '<li>Sin pruebas guardadas.</li>';
        return;
    }

    historyList.innerHTML = entries
        .map((entry) => `<li>${entry.date} - Download ${entry.download} Mbps - Upload ${entry.upload} Mbps - Ping ${entry.ping} ms</li>`)
        .join('');
}

function saveHistory(item) {
    const current = safeReadHistory();
    current.unshift(item);
    safeWriteHistory(current.slice(0, 5));
    renderHistory();
}

function updateGauge(downloadMbps) {
    const needle = document.getElementById('gauge-needle');
    const valueLabel = document.getElementById('gauge-value');
    if (!needle || !valueLabel) return;

    const clamped = Math.max(0, Math.min(200, downloadMbps));
    const angle = (clamped / 200) * 180 - 90;
    needle.style.transform = `translateX(-50%) rotate(${angle}deg)`;

    if (downloadMbps < 20) {
        needle.style.background = '#ef4444';
        valueLabel.style.color = '#ef4444';
    } else if (downloadMbps <= 80) {
        needle.style.background = '#f59e0b';
        valueLabel.style.color = '#f59e0b';
    } else {
        needle.style.background = '#22c55e';
        valueLabel.style.color = '#22c55e';
    }

    valueLabel.textContent = `${formatNumber(downloadMbps, 1)} Mbps`;
}

function setLoadingState(isLoading, text = 'Ejecutando diagnóstico real...') {
    const loading = document.getElementById('loading-animation');
    const loadingText = document.getElementById('loading-text');
    const results = document.getElementById('results');

    if (loading) loading.style.display = isLoading ? 'block' : 'none';
    if (results) results.classList.toggle('loading-state', isLoading);
    if (loadingText && isLoading) loadingText.textContent = text;
}

function updateProgressSimulation() {
    const progressFill = document.querySelector('.progress-fill');
    const loadingText = document.getElementById('loading-text');
    let progress = 0;

    const interval = setInterval(() => {
        progress = Math.min(95, progress + Math.random() * 8);
        if (progressFill) progressFill.style.width = `${progress}%`;
        if (loadingText) loadingText.textContent = `Ejecutando diagnóstico real... ${Math.round(progress)}%`;
    }, 280);

    return {
        complete() {
            clearInterval(interval);
            if (progressFill) progressFill.style.width = '100%';
            if (loadingText) loadingText.textContent = 'Diagnóstico completado';
        },
        stop() {
            clearInterval(interval);
            if (progressFill) progressFill.style.width = '0%';
        }
    };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function loadConnectionData() {
    fetch('https://ipapi.co/json/')
        .then((res) => res.json())
        .then((data) => {
            setText('ip', data.ip);
            setText('isp', data.org);
            setText('city', data.city);
            setText('country', data.country_name);
            setText('asn', data.asn);

            userCountry = data.country_name || '-';
            userISP = data.org || '-';
            setText('isp-result', userISP);
        })
        .catch(() => showConnectionError());
}

async function measurePingAndJitter() {
    const samples = [];

    for (let i = 0; i < 5; i += 1) {
        const start = performance.now();
        try {
            await fetchWithTimeout(`${LIBRESPEED_EMPTY}?cacheBust=${Date.now()}-${i}`, {
                mode: 'no-cors',
                cache: 'no-store'
            }, 2500);
        } catch {
            // conservar tiempo como aproximación de latencia
        }
        samples.push(performance.now() - start);
    }

    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const deltas = samples.slice(1).map((value, idx) => Math.abs(value - samples[idx]));
    const jitter = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;

    return {
        ping: Math.round(avg),
        jitter: Math.round(jitter)
    };
}

async function measureDownload() {
    const samples = [];

    for (let i = 0; i < DOWNLOAD_SAMPLE_BYTES.length; i += 1) {
        const bytes = DOWNLOAD_SAMPLE_BYTES[i];
        const url = `${LIBRESPEED_GARBAGE}?ckSize=${bytes}&cacheBust=${Date.now()}-${i}`;
        const start = performance.now();

        try {
            await fetchWithTimeout(url, {
                mode: 'no-cors',
                cache: 'no-store'
            }, 5000);

            const duration = (performance.now() - start) / 1000;
            const mbps = (bytes * 8) / duration / 1000000;
            if (Number.isFinite(mbps) && mbps > 0) {
                samples.push(mbps);
            }
        } catch {
            // siguiente sample
        }
    }

    // fallback same-origin para evitar test muerto
    if (!samples.length) {
        const start = performance.now();
        const response = await fetchWithTimeout(`./test-download.bin?cacheBust=${Date.now()}`, { cache: 'no-store' }, 10000);
        if (!response.ok) {
            throw new Error('No se pudo medir descarga');
        }
        const buffer = await response.arrayBuffer();
        const duration = (performance.now() - start) / 1000;
        const mbps = (buffer.byteLength * 8) / duration / 1000000;
        if (Number.isFinite(mbps) && mbps > 0) {
            samples.push(mbps);
        }
    }

    const average = samples.reduce((a, b) => a + b, 0) / samples.length;
    return { average, samples };
}

async function measureUpload() {
    const payload = new Blob([new Uint8Array(UPLOAD_SIZE_BYTES)], { type: 'application/octet-stream' });

    const start = performance.now();
    try {
        await fetchWithTimeout(`${LIBRESPEED_GARBAGE}?cacheBust=${Date.now()}`, {
            method: 'POST',
            body: payload,
            mode: 'no-cors',
            cache: 'no-store'
        }, 7000);
    } catch {
        const fallback = await fetchWithTimeout(`https://httpbin.org/post?cacheBust=${Date.now()}`, {
            method: 'POST',
            body: payload,
            cache: 'no-store'
        }, 9000);

        if (!fallback.ok) {
            throw new Error('No se pudo medir subida');
        }
    }

    const duration = (performance.now() - start) / 1000;
    const mbps = (UPLOAD_SIZE_BYTES * 8) / duration / 1000000;
    if (!Number.isFinite(mbps) || mbps <= 0) {
        throw new Error('Subida inválida');
    }

    return mbps;
}

function calculateStability(samples) {
    if (!samples.length) return 0;
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    if (max <= 0) return 0;
    const variationPercent = ((max - min) / max) * 100;
    return Math.max(0, Math.min(100, Math.round(100 - variationPercent)));
}

async function copyResultToClipboard() {
    const text = [
        'Internet Speed Result',
        `Download: ${document.getElementById('download')?.textContent || '0.00'} Mbps`,
        `Upload: ${document.getElementById('upload')?.textContent || '0.00'} Mbps`,
        `Ping: ${document.getElementById('ping')?.textContent || '0'} ms`,
        `Fecha: ${new Date().toLocaleDateString('es-AR')}`,
        `País: ${userCountry}`
    ].join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
}

function toggleInterviewMode(forceMode = null) {
    isInterviewMode = typeof forceMode === 'boolean' ? forceMode : !isInterviewMode;
    document.body.classList.toggle('interview-mode', isInterviewMode);

    const interviewButton = document.getElementById('interview-mode');
    const backButton = document.getElementById('back-home');

    if (interviewButton) {
        interviewButton.textContent = isInterviewMode ? 'Salir de modo entrevista' : 'Modo entrevista';
        interviewButton.classList.toggle('active', isInterviewMode);
    }

    if (backButton) {
        backButton.hidden = !isInterviewMode;
    }
}

function setZeroResults() {
    setText('download', '0.00');
    setText('upload', '0.00');
    setText('ping', '0');
    setText('avg-ping', '0');
    setText('jitter', '0');
    setText('stability', '0');
    setText('speed-class', 'No disponible');
    updateGauge(0);
}

async function startTest() {
    const startButton = document.getElementById('start-test');
    if (!startButton) return;

    startButton.disabled = true;
    startButton.textContent = 'Midiendo...';

    setLoadingState(true, 'Iniciando diagnóstico de red...');
    const progress = updateProgressSimulation();

    try {
        const pingResult = await measurePingAndJitter();
        setText('ping', String(pingResult.ping));
        setText('avg-ping', String(pingResult.ping));
        setText('jitter', String(pingResult.jitter));

        const [downloadSettled, uploadSettled] = await Promise.allSettled([
            measureDownload(),
            measureUpload()
        ]);

        let downloadMbps = 0;
        let uploadMbps = 0;
        let stability = 0;

        if (downloadSettled.status === 'fulfilled') {
            downloadMbps = downloadSettled.value.average;
            stability = calculateStability(downloadSettled.value.samples);
            setText('speed-class', getSpeedClassification(downloadMbps));
            updateGauge(downloadMbps);
        } else {
            setText('speed-class', 'No disponible');
            updateGauge(0);
        }

        if (uploadSettled.status === 'fulfilled') {
            uploadMbps = uploadSettled.value;
        }

        setText('download', formatNumber(downloadMbps));
        setText('upload', formatNumber(uploadMbps));
        setText('stability', String(stability));
        setText('isp-result', userISP);

        saveHistory({
            date: new Date().toLocaleDateString('es-AR'),
            download: formatNumber(downloadMbps),
            upload: formatNumber(uploadMbps),
            ping: String(pingResult.ping)
        });

        progress.complete();
    } catch {
        progress.stop();
        setText('loading-text', 'Error en la prueba. Reintentá.');
        setZeroResults();
    } finally {
        setTimeout(() => setLoadingState(false), 700);
        startButton.disabled = false;
        startButton.textContent = 'Volver a testear';
    }
}

function init() {
    const startButton = document.getElementById('start-test');
    const interviewButton = document.getElementById('interview-mode');
    const backButton = document.getElementById('back-home');
    const copyButton = document.getElementById('copy-result');

    if (startButton) startButton.addEventListener('click', startTest);
    if (interviewButton) interviewButton.addEventListener('click', () => toggleInterviewMode());
    if (backButton) backButton.addEventListener('click', () => toggleInterviewMode(false));

    if (copyButton) {
        copyButton.addEventListener('click', async () => {
            try {
                await copyResultToClipboard();
                copyButton.textContent = 'Resultado copiado ✅';
                setTimeout(() => {
                    copyButton.textContent = 'COPIAR RESULTADO PARA ENTREVISTA';
                }, 1200);
            } catch {
                copyButton.textContent = 'No se pudo copiar';
            }
        });
    }

    renderHistory();
    loadConnectionData();
}

document.addEventListener('DOMContentLoaded', init);
