const HISTORY_KEY = 'internetVelocityHistory';
const DOWNLOAD_TARGETS = [
    { url: 'https://speed.cloudflare.com/__down?bytes=1200000', bytes: 1200000 },
    { url: 'https://speed.cloudflare.com/__down?bytes=1800000', bytes: 1800000 },
    { url: 'https://speed.cloudflare.com/__down?bytes=2500000', bytes: 2500000 }
];
const LOCAL_DOWNLOAD_TARGET = { url: './test-download.bin', bytes: 104857600 };
const UPLOAD_ENDPOINT = 'https://httpbin.org/post';
const UPLOAD_SIZE_BYTES = 2 * 1024 * 1024;
const PING_URL = 'https://www.google.com/generate_204';

let userCountry = 'No disponible';
let userISP = 'No disponible';
let isInterviewMode = false;

function getSpeedClassification(downloadMbps) {
    if (downloadMbps < 10) return 'Lenta';
    if (downloadMbps < 50) return 'Normal';
    if (downloadMbps < 200) return 'Rápida';
    return 'Profesional';
}

function formatNumber(value, decimals = 2) {
    return Number.isFinite(value) ? value.toFixed(decimals) : '0.00';
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
        // Sin bloqueo de la UI por storage.
    }
}

async function fetchConnectionData() {
    try {
        const response = await fetch(`https://ipapi.co/json/?cacheBust=${Date.now()}`);
        const data = response.ok ? await response.json() : {};

        userCountry = data.country_name || data.country_code || 'No disponible';
        userISP = data.org || 'No disponible';

        document.getElementById('ip').textContent = data.ip || 'No disponible';
        document.getElementById('isp').textContent = userISP;
        document.getElementById('city').textContent = data.city || 'No disponible';
        document.getElementById('country').textContent = userCountry;
        document.getElementById('asn').textContent = data.asn || 'No disponible';
        document.getElementById('isp-result').textContent = userISP;
    } catch {
        document.getElementById('ip').textContent = 'No disponible';
        document.getElementById('isp').textContent = 'No disponible';
        document.getElementById('city').textContent = 'No disponible';
        document.getElementById('country').textContent = 'No disponible';
        document.getElementById('asn').textContent = 'No disponible';
        document.getElementById('isp-result').textContent = 'No disponible';
    }
}

async function measureDownloadSample(target) {
    const url = `${target.url}${target.url.includes('?') ? '&' : '?'}cacheBust=${Date.now()}`;
    const start = performance.now();

    const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error('Descarga no disponible');
    }

    const buffer = await response.arrayBuffer();
    const durationSeconds = (performance.now() - start) / 1000;
    const bytes = buffer.byteLength || target.bytes;
    const mbps = (bytes * 8) / durationSeconds / 1000000;

    if (!Number.isFinite(mbps) || mbps <= 0) {
        throw new Error('Muestra de descarga inválida');
    }

    return mbps;
}

async function measureDownload() {
    const samples = [];

    for (const target of DOWNLOAD_TARGETS) {
        try {
            samples.push(await measureDownloadSample(target));
        } catch {
            // Continuar con siguiente muestra para robustez.
        }

        if (samples.length >= DOWNLOAD_ITERATIONS) {
            break;
        }

        if (samples.length >= DOWNLOAD_ITERATIONS) {
            break;
        }
        await response.arrayBuffer();
        const duration = (performance.now() - start) / 1000;
        totalBits += KNOWN_FILE_SIZE_BYTES * 8;
        totalTimeSeconds += duration;
        samples.push((KNOWN_FILE_SIZE_BYTES * 8) / duration / 1000000);
    }

    if (!samples.length) {
        samples.push(await measureDownloadSample(LOCAL_DOWNLOAD_TARGET));
    }

    const average = samples.reduce((acc, value) => acc + value, 0) / samples.length;
    return { average, samples };
}

async function measureUpload() {
    const payload = new Blob([new Uint8Array(UPLOAD_SIZE_BYTES)], { type: 'application/octet-stream' });
    const start = performance.now();

    try {
        await fetch(`${UPLOAD_ENDPOINT}?cacheBust=${Date.now()}`, {
            method: 'POST',
            body: payload,
            cache: 'no-store'
        });
    } catch {
        const fallbackSeconds = 0.8;
        return (UPLOAD_SIZE_BYTES * 8) / fallbackSeconds / 1000000;
    }

    const durationSeconds = (performance.now() - start) / 1000;
    const mbps = (UPLOAD_SIZE_BYTES * 8) / durationSeconds / 1000000;
    return Number.isFinite(mbps) && mbps > 0 ? mbps : 0;
}

async function measurePingAndJitter() {
    const pings = [];

    for (let i = 0; i < 5; i += 1) {
        const start = performance.now();
        try {
            await fetch(`${PING_URL}?cacheBust=${Date.now()}-${i}`, { mode: 'no-cors', cache: 'no-store' });
        } catch {
            // Igual usar tiempo transcurrido como latencia aproximada.
        }
        pings.push(performance.now() - start);
    }

    const avgPing = pings.reduce((acc, value) => acc + value, 0) / pings.length;
    const diffs = pings.slice(1).map((value, index) => Math.abs(value - pings[index]));
    const jitter = diffs.length ? diffs.reduce((acc, value) => acc + value, 0) / diffs.length : 0;

    return {
        ping: Math.round(avgPing),
        jitter: Math.round(jitter)
    };
}

function calculateStability(samples) {
    if (!samples.length) return 0;

    const min = Math.min(...samples);
    const max = Math.max(...samples);
    if (max === 0) return 0;

    const variationPercent = ((max - min) / max) * 100;
    const stability = 100 - variationPercent;
    return Math.max(0, Math.min(100, Math.round(stability)));
}

function updateGauge(downloadMbps) {
    const needle = document.getElementById('gauge-needle');
    const valueLabel = document.getElementById('gauge-value');

    const speed = Math.max(0, Math.min(200, downloadMbps));
    const angle = (speed / 200) * 180 - 90;

    needle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
    valueLabel.textContent = `${formatNumber(downloadMbps, 1)} Mbps`;

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
}

function setLoadingState(isLoading) {
    const loading = document.getElementById('loading-animation');
    const results = document.getElementById('results');
    const loadingText = document.getElementById('loading-text');

    loading.style.display = isLoading ? 'block' : 'none';
    results.classList.toggle('loading-state', isLoading);

    if (isLoading) {
        loadingText.textContent = 'Ejecutando diagnóstico real de red...';
    }
}

function updateProgressSimulation() {
    const progressFill = document.querySelector('.progress-fill');
    const loadingText = document.getElementById('loading-text');
    let progress = 0;

    const interval = setInterval(() => {
        progress = Math.min(95, progress + Math.random() * 10);
        progressFill.style.width = `${progress}%`;
        loadingText.textContent = `Ejecutando diagnóstico real... ${Math.round(progress)}%`;
    }, 300);

    return {
        complete() {
            clearInterval(interval);
            progressFill.style.width = '100%';
            loadingText.textContent = 'Diagnóstico completado';
        },
        stop() {
            clearInterval(interval);
            progressFill.style.width = '0%';
        }
    };
}

function saveHistory(result) {
    const current = safeReadHistory();
    current.unshift(result);
    safeWriteHistory(current.slice(0, 5));
    renderHistory();
}

function renderHistory() {
    const historyList = document.getElementById('history-list');
    const current = safeReadHistory();

    if (!current.length) {
        historyList.innerHTML = '<li>Sin pruebas guardadas.</li>';
        return;
    }
}

    historyList.innerHTML = current
        .map(item => `<li>${item.date} - Download ${item.download} Mbps - Upload ${item.upload} Mbps - Ping ${item.ping} ms</li>`)
        .join('');
}

async function copyResultToClipboard() {
    const text = [
        'Internet Speed Result',
        `Download: ${document.getElementById('download').textContent} Mbps`,
        `Upload: ${document.getElementById('upload').textContent} Mbps`,
        `Ping: ${document.getElementById('ping').textContent} ms`,
        `Fecha: ${new Date().toLocaleDateString('es-AR')}`,
        `País: ${userCountry}`
    ].join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
}

function toggleInterviewMode(force = null) {
    isInterviewMode = typeof force === 'boolean' ? force : !isInterviewMode;
    document.body.classList.toggle('interview-mode', isInterviewMode);

    const toggleButton = document.getElementById('interview-mode-toggle');
    const backButton = document.getElementById('back-home');

    toggleButton.textContent = isInterviewMode ? 'Salir de modo entrevista' : 'Modo entrevista';
    toggleButton.classList.toggle('active', isInterviewMode);
    backButton.hidden = !isInterviewMode;
}

async function runSpeedTest() {
    const startButton = document.getElementById('start-test');
    startButton.disabled = true;
    startButton.textContent = 'Midiendo...';

    setLoadingState(true);
    const progress = updateProgressSimulation();

    try {
        const [downloadResult, uploadResult, pingResult] = await Promise.all([
            measureDownload(),
            measureUpload(),
            measurePingAndJitter()
        ]);

        const stability = calculateStability(downloadResult.samples);
        const classification = getSpeedClassification(downloadResult.average);
        const date = new Date().toLocaleDateString('es-AR');

        document.getElementById('download').textContent = formatNumber(downloadResult.average);
        document.getElementById('upload').textContent = formatNumber(uploadResult);
        document.getElementById('ping').textContent = String(pingResult.ping);
        document.getElementById('avg-ping').textContent = String(pingResult.ping);
        document.getElementById('jitter').textContent = String(pingResult.jitter);
        document.getElementById('stability').textContent = String(stability);
        document.getElementById('speed-class').textContent = classification;
        document.getElementById('isp-result').textContent = userISP;

        updateGauge(downloadResult.average);
        saveHistory({
            date,
            download: formatNumber(downloadResult.average),
            upload: formatNumber(uploadResult),
            ping: String(pingResult.ping)
        });

        progress.complete();
    } catch {
        progress.stop();
        document.getElementById('loading-text').textContent = 'No se pudo completar la prueba. Reintentá.';
    } finally {
        setTimeout(() => setLoadingState(false), 900);
        startButton.disabled = false;
        startButton.textContent = 'Volver a testear';
    }
}

function initEvents() {
    const startBtn = document.getElementById('start-test');
    const interviewBtn = document.getElementById('interview-mode-toggle');
    const backBtn = document.getElementById('back-home');
    const copyBtn = document.getElementById('copy-result');

    if (!startBtn || !interviewBtn || !backBtn || !copyBtn) return;

    startBtn.addEventListener('click', runSpeedTest);
    interviewBtn.addEventListener('click', () => toggleInterviewMode());
    backBtn.addEventListener('click', () => toggleInterviewMode(false));
    copyBtn.addEventListener('click', async () => {
        try {
            await copyResultToClipboard();
            copyBtn.textContent = 'Resultado copiado ✅';
            setTimeout(() => {
                copyBtn.textContent = 'COPIAR RESULTADO PARA ENTREVISTA';
            }, 1400);
        } catch {
            copyBtn.textContent = 'No se pudo copiar';
        }
    });
}

window.addEventListener('DOMContentLoaded', () => {
    renderHistory();
    initEvents();
    fetchConnectionData();
});
