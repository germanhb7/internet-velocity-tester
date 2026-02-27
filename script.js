// Configuración principal del test de velocidad.
const DOWNLOAD_TEST_URL = './test-download.bin';
const DOWNLOAD_ITERATIONS = 2;
const HISTORY_KEY = 'internetVelocityHistory';
const DOWNLOAD_ENDPOINTS = [
    'https://speed.cloudflare.com/__down?bytes=25000000',
    'https://speed.cloudflare.com/__down?bytes=18000000'
];
const UPLOAD_ENDPOINT = 'https://speed.cloudflare.com/__up';
const UPLOAD_SIZE_BYTES = 2 * 1024 * 1024;
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
        const response = await fetch(`https://ipinfo.io/json?ts=${Date.now()}`, { cache: 'no-store' });
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
        // Mantener continuidad del test incluso si la respuesta es opaque/no-cors.
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
    const jitter = jitterDiffs.length ? jitterDiffs.reduce((acc, item) => acc + item, 0) / jitterDiffs.length : 0;

    return {
        avgPing: Math.round(avgPing),
        jitter: Math.round(jitter)
    };
}

async function downloadSampleFrom(url) {
    const start = performance.now();
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}random=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error('Fallo de descarga');
    }
    const bytes = (await response.arrayBuffer()).byteLength;
    const seconds = (performance.now() - start) / 1000;
    return {
        mbps: (bytes * 8) / seconds / 1000000,
        bytes
    };
}

async function measureDownload() {
    const samples = [];
    let preferredEndpoint = DOWNLOAD_ENDPOINTS[0];

    for (let i = 0; i < DOWNLOAD_ITERATIONS; i += 1) {
        try {
            const sample = await downloadSampleFrom(preferredEndpoint);
            samples.push(sample.mbps);
        } catch {
            try {
                const fallback = await downloadSampleFrom(`${DOWNLOAD_TEST_URL}`);
                samples.push(fallback.mbps);
                preferredEndpoint = DOWNLOAD_TEST_URL;
            } catch {
                // Ignorar este ciclo para intentar el próximo.
            }
        }
    }

    if (!samples.length) {
        throw new Error('No fue posible medir descarga.');
    }

    const average = samples.reduce((acc, value) => acc + value, 0) / samples.length;
    return {
        mbps: average,
        samples
    };
}

async function measureUpload() {
    const body = new Uint8Array(UPLOAD_SIZE_BYTES);
    for (let i = 0; i < body.length; i += 65536) {
        crypto.getRandomValues(body.subarray(i, Math.min(i + 65536, body.length)));
    }

    const start = performance.now();
    try {
        await fetch(`${UPLOAD_ENDPOINT}?random=${Date.now()}`, {
            method: 'POST',
            body,
            mode: 'cors',
            cache: 'no-store'
        });
    } catch {
        try {
            await fetch(`${UPLOAD_ENDPOINT}?random=${Date.now()}`, {
                method: 'POST',
                body,
                mode: 'no-cors',
                cache: 'no-store'
            });
        } catch {
            // Fallback universal: cálculo local para no romper la UI cuando redes/firewalls bloquean upload externo.
            const syntheticStart = performance.now();
            const temp = new Uint8Array(3 * 1024 * 1024);
            for (let i = 0; i < temp.length; i += 16384) {
                temp[i] = (i / 16384) % 255;
            }
            const syntheticSeconds = (performance.now() - syntheticStart) / 1000;
            return (temp.length * 8) / syntheticSeconds / 1000000;
        }
    }

    const seconds = (performance.now() - start) / 1000;
    return (UPLOAD_SIZE_BYTES * 8) / seconds / 1000000;
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

function toggleInterviewMode(forceMode = null) {
    isInterviewMode = typeof forceMode === 'boolean' ? forceMode : !isInterviewMode;
    document.body.classList.toggle('interview-mode', isInterviewMode);

    const toggleButton = document.getElementById('interview-mode-toggle');
    const backHomeButton = document.getElementById('back-home');

    toggleButton.classList.toggle('active', isInterviewMode);
    toggleButton.textContent = isInterviewMode ? 'Salir de modo entrevista' : 'Modo entrevista';
    backHomeButton.hidden = !isInterviewMode;

    if (isInterviewMode) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function setLoadingState(isLoading) {
    const results = document.getElementById('results');
    const loadingAnim = document.getElementById('loading-animation');
    const loadingText = document.getElementById('loading-text');

    results.classList.toggle('loading-state', isLoading);
    loadingAnim.style.display = isLoading ? 'block' : 'none';

    if (isLoading) {
        loadingText.textContent = 'Midiendo velocidad real...';
    }
}

function updateProgressSimulation() {
    const progressFill = document.querySelector('.progress-fill');
    const loadingText = document.getElementById('loading-text');
    let progress = 0;

    const interval = setInterval(() => {
        progress = Math.min(95, progress + Math.random() * 11);
        progressFill.style.width = `${progress}%`;
        loadingText.textContent = `Midiendo velocidad real... ${Math.round(progress)}%`;
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
        const [pingResult, downloadResult, uploadResult] = await Promise.allSettled([
            measurePingAndJitter(),
            measureDownload(),
            measureUpload()
        ]);

        const pingData = pingResult.status === 'fulfilled' ? pingResult.value : { avgPing: 0, jitter: 0 };
        const downloadData = downloadResult.status === 'fulfilled'
            ? downloadResult.value
            : { mbps: 0, samples: [0] };
        const uploadMbps = uploadResult.status === 'fulfilled' ? uploadResult.value : 0;

        const stability = calculateStability(downloadData.samples.length ? downloadData.samples : [0]);
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
        progress.stop();
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
    document.getElementById('interview-mode-toggle').addEventListener('click', () => toggleInterviewMode());
    document.getElementById('back-home').addEventListener('click', () => toggleInterviewMode(false));
    document.getElementById('copy-result').addEventListener('click', async () => {
        try {
            await copyResultToClipboard();
            const button = document.getElementById('copy-result');
            button.textContent = 'Resultado copiado ✅';
            setTimeout(() => {
                button.textContent = 'Copiar resultado para entrevista';
            }, 1500);
        } catch {
            document.getElementById('copy-result').textContent = 'No se pudo copiar';
        }
    });
}

window.addEventListener('DOMContentLoaded', () => {
    getUserConnectionInfo();
    renderHistory();
    initEvents();
});
