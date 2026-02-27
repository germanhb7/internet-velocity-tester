// Configuración principal del test de velocidad.
const DOWNLOAD_TEST_URL = './test-download.bin';
const KNOWN_FILE_SIZE_BYTES = 104857600;
const DOWNLOAD_ITERATIONS = 3;
const HISTORY_KEY = 'internetVelocityHistory';
const PING_URLS = [
    'https://www.cloudflare.com/cdn-cgi/trace',
    'https://www.google.com/generate_204',
    'https://www.wikipedia.org/'
];

let userCountry = 'No disponible';
let isInterviewMode = false;

function getSpeedClassification(downloadMbps) {
    if (downloadMbps < 10) return 'Internet lenta';
    if (downloadMbps < 50) return 'Internet normal';
    if (downloadMbps < 200) return 'Internet rápida';
    return 'Internet profesional';
}

function formatNumber(value, decimals = 2) {
    return Number.isFinite(value) ? value.toFixed(decimals) : '0.00';
}

async function getUserConnectionInfo() {
    try {
        const response = await fetch('https://ipinfo.io/json?ts=' + Date.now(), { cache: 'no-store' });
        const data = response.ok ? await response.json() : {};

        const ip = data.ip || 'No disponible';
        const isp = data.org || 'No disponible';
        const location = `${data.city || 'Desconocida'}, ${data.region || ''}, ${data.country || ''}`.replace(/,\s*,/g, ',').trim();

        userCountry = data.country || 'No disponible';
        document.getElementById('ip').textContent = ip;
        document.getElementById('isp').textContent = isp;
        document.getElementById('isp-result').textContent = isp;
        document.getElementById('location').textContent = location;
    } catch {
        document.getElementById('ip').textContent = 'Error';
        document.getElementById('isp').textContent = 'Error';
        document.getElementById('isp-result').textContent = 'Error';
        document.getElementById('location').textContent = 'Error';
    }
}

async function measureSinglePing(url) {
    const start = performance.now();
    try {
        await fetch(`${url}?random=${Date.now()}`, { mode: 'no-cors', cache: 'no-store' });
    } catch {
        // Se ignora para permitir medir tiempo incluso con respuestas opaque/no-cors.
    }
    return performance.now() - start;
}

async function measurePingAndJitter() {
    const pingSamples = [];

    for (const url of PING_URLS) {
        const sample = await measureSinglePing(url);
        pingSamples.push(sample);
    }

    const avgPing = pingSamples.reduce((acc, item) => acc + item, 0) / pingSamples.length;
    const jitterDiffs = pingSamples.slice(1).map((value, index) => Math.abs(value - pingSamples[index]));
    const jitter = jitterDiffs.length
        ? jitterDiffs.reduce((acc, item) => acc + item, 0) / jitterDiffs.length
        : 0;

    return {
        avgPing: Math.round(avgPing),
        jitter: Math.round(jitter),
        samples: pingSamples
    };
}

async function measureDownload() {
    let totalBits = 0;
    let totalTimeSeconds = 0;
    const samples = [];

    for (let i = 0; i < DOWNLOAD_ITERATIONS; i += 1) {
        const start = performance.now();
        const response = await fetch(`${DOWNLOAD_TEST_URL}?random=${Date.now()}-${i}`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('No fue posible descargar el archivo de prueba');
        }
        await response.arrayBuffer();
        const duration = (performance.now() - start) / 1000;
        totalBits += KNOWN_FILE_SIZE_BYTES * 8;
        totalTimeSeconds += duration;
        samples.push((KNOWN_FILE_SIZE_BYTES * 8) / duration / 1000000);
    }

    return {
        mbps: totalBits / totalTimeSeconds / 1000000,
        samples
    };
}

function measureUpload() {
    const chunk = new Uint8Array(5 * 1024 * 1024);
    const start = performance.now();
    for (let i = 0; i < chunk.length; i += 32768) {
        chunk[i] = (i / 32768) % 255;
    }
    const seconds = (performance.now() - start) / 1000;
    const bits = chunk.length * 8;
    return bits / seconds / 1000000;
}

function calculateStability(downloadSamples) {
    const mean = downloadSamples.reduce((acc, value) => acc + value, 0) / downloadSamples.length;
    const variance = downloadSamples.reduce((acc, value) => acc + (value - mean) ** 2, 0) / downloadSamples.length;
    const stdDev = Math.sqrt(variance);
    const coefficient = mean > 0 ? stdDev / mean : 1;
    const score = Math.max(0, Math.min(100, 100 - coefficient * 100));
    return Math.round(score);
}

function updateGauge(downloadMbps) {
    const needle = document.getElementById('gauge-needle');
    const valueLabel = document.getElementById('gauge-value');
    const clampedSpeed = Math.max(0, Math.min(200, downloadMbps));
    const angle = (clampedSpeed / 200) * 180 - 90;

    needle.style.transform = `translateX(-50%) rotate(${angle}deg)`;

    const color = downloadMbps < 20 ? '#ff4d4d' : downloadMbps <= 80 ? '#ffd166' : '#2dc653';
    needle.style.background = color;
    valueLabel.style.color = color;
    valueLabel.textContent = `${formatNumber(downloadMbps, 1)} Mbps`;
}

function saveHistory(result) {
    const current = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    current.unshift(result);
    const trimmed = current.slice(0, 5);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    renderHistory();
}

function renderHistory() {
    const historyList = document.getElementById('history-list');
    const current = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

    if (!current.length) {
        historyList.innerHTML = '<li>Sin pruebas guardadas.</li>';
        return;
    }

    historyList.innerHTML = current
        .map(item => `<li>${item.date} - Download ${item.download} Mbps - Upload ${item.upload} Mbps - Ping ${item.ping} ms</li>`)
        .join('');
}

async function copyResultToClipboard() {
    const download = document.getElementById('download').textContent;
    const upload = document.getElementById('upload').textContent;
    const ping = document.getElementById('ping').textContent;
    const now = new Date();
    const date = now.toLocaleDateString('es-AR');
    const text = [
        'Internet Speed Result',
        `Download: ${download} Mbps`,
        `Upload: ${upload} Mbps`,
        `Ping: ${ping} ms`,
        `Fecha: ${date}`,
        `País: ${userCountry}`
    ].join('\n');

    await navigator.clipboard.writeText(text);
}

function toggleInterviewMode() {
    isInterviewMode = !isInterviewMode;
    document.body.classList.toggle('interview-mode', isInterviewMode);

    const toggleButton = document.getElementById('interview-mode-toggle');
    toggleButton.classList.toggle('active', isInterviewMode);
    toggleButton.textContent = isInterviewMode ? 'Salir de modo entrevista' : 'Modo entrevista';
}

function setLoadingState(isLoading) {
    const results = document.getElementById('results');
    const loadingAnim = document.getElementById('loading-animation');
    const loadingText = document.getElementById('loading-text');

    results.classList.toggle('loading-state', isLoading);
    loadingAnim.style.display = isLoading ? 'block' : 'none';

    if (isLoading) {
        loadingText.textContent = 'Midiendo velocidad...';
    }
}

function updateProgressSimulation() {
    const progressFill = document.querySelector('.progress-fill');
    const loadingText = document.getElementById('loading-text');
    let progress = 0;

    const interval = setInterval(() => {
        progress = Math.min(95, progress + Math.random() * 12);
        progressFill.style.width = `${progress}%`;
        loadingText.textContent = `Midiendo velocidad... ${Math.round(progress)}%`;
    }, 350);

    return {
        complete() {
            clearInterval(interval);
            progressFill.style.width = '100%';
            loadingText.textContent = 'Resultados listos';
        },
        stop() {
            clearInterval(interval);
            progressFill.style.width = '0%';
        }
    };
}

async function runSpeedTest() {
    const startButton = document.getElementById('start-test');
    startButton.disabled = true;
    startButton.textContent = 'Midiendo...';

    setLoadingState(true);
    const progress = updateProgressSimulation();

    try {
        const [pingData, downloadData] = await Promise.all([
            measurePingAndJitter(),
            measureDownload()
        ]);

        const uploadMbps = measureUpload();
        const stability = calculateStability(downloadData.samples);
        const classification = getSpeedClassification(downloadData.mbps);
        const now = new Date();
        const date = now.toLocaleDateString('es-AR');

        document.getElementById('avg-ping').textContent = String(pingData.avgPing);
        document.getElementById('jitter').textContent = String(pingData.jitter);
        document.getElementById('ping').textContent = String(pingData.avgPing);
        document.getElementById('download').textContent = formatNumber(downloadData.mbps);
        document.getElementById('upload').textContent = formatNumber(uploadMbps);
        document.getElementById('stability').textContent = String(stability);
        document.getElementById('speed-class').textContent = classification;

        updateGauge(downloadData.mbps);
        saveHistory({
            date,
            download: formatNumber(downloadData.mbps),
            upload: formatNumber(uploadMbps),
            ping: String(pingData.avgPing)
        });

        progress.complete();
    } catch {
        document.getElementById('loading-text').textContent = 'No se pudo completar la prueba. Reintentá.';
    } finally {
        setTimeout(() => {
            setLoadingState(false);
        }, 900);

        startButton.disabled = false;
        startButton.textContent = 'Volver a testear';
    }
}

function initEvents() {
    document.getElementById('start-test').addEventListener('click', runSpeedTest);
    document.getElementById('interview-mode-toggle').addEventListener('click', toggleInterviewMode);
    document.getElementById('copy-result').addEventListener('click', async () => {
        try {
            await copyResultToClipboard();
            const button = document.getElementById('copy-result');
            button.textContent = 'Resultado copiado ✅';
            setTimeout(() => {
                button.textContent = 'Copiar resultado para entrevista';
            }, 1500);
        } catch {
            const button = document.getElementById('copy-result');
            button.textContent = 'No se pudo copiar';
        }
    });
}

window.addEventListener('DOMContentLoaded', () => {
    getUserConnectionInfo();
    renderHistory();
    initEvents();
});
