// Configuración principal
const HISTORY_KEY = 'internetVelocityHistory';
const DOWNLOAD_TEST_URL = 'https://httpbin.org/bytes/';  // AWS global para download
const UPLOAD_TEST_URL = 'https://httpbin.org/post';      // AWS global para upload
const PING_TEST_URL = 'https://httpbin.org/get';         // AWS global para ping
const FALLBACK_PING_URL = 'https://www.cloudflare.com/cdn-cgi/trace';  // Cloudflare fallback global
const FALLBACK_DOWNLOAD_FILE = './test-download-5mb.bin';  // Opcional: Sube a Netlify para fallback (genera con dd if=/dev/urandom of=test-download-5mb.bin bs=1M count=5)
const DOWNLOAD_BYTES_SAMPLES = [500000, 1000000, 2000000];
const UPLOAD_SIZE_BYTES = 1024 * 1024; // 1MB

let userCountry = 'No disponible';
let userISP = 'No disponible';
let isInterviewMode = false;

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
        console.warn('No se pudo guardar historial: localStorage bloqueado');
    }
}

function saveHistory(item) {
    const current = safeReadHistory();
    current.unshift(item);
    safeWriteHistory(current.slice(0, 5));
    renderHistory();
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
        progress = Math.min(95, progress + Math.random() * 9);
        if (progressFill) progressFill.style.width = `${progress}%`;
        if (loadingText) loadingText.textContent = `Ejecutando diagnóstico real... ${Math.round(progress)}%`;
    }, 300);

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

async function fetchConnectionData() {
    const ipElement = document.getElementById('ip');
    const ispElement = document.getElementById('isp');
    const cityElement = document.getElementById('city');
    const countryElement = document.getElementById('country');
    const asnElement = document.getElementById('asn');

    if (!ipElement || !ispElement || !cityElement || !countryElement || !asnElement) return;

    const apis = [
        'https://ipapi.co/json/',          // Primaria, ya funciona
        'https://ipwho.is/',               // Fallback global
        'https://freeipapi.com/api/json'   // Otro fallback
    ];

    for (const api of apis) {
        try {
            const res = await fetchWithTimeout(api, {}, 5000);
            const data = await res.json();
            // Normaliza keys para compatibilidad
            ipElement.textContent = data.ip || data.ipAddress || 'No disponible';
            ispElement.textContent = data.org || data.connection?.org || data.ispName || 'No disponible';
            cityElement.textContent = data.city || data.cityName || 'No disponible';
            countryElement.textContent = data.country_name || data.countryName || data.country || 'No disponible';
            asnElement.textContent = data.asn || data.connection?.asn || data.asNumber || 'No disponible';

            userCountry = data.country_name || data.countryName || data.country || 'No disponible';
            userISP = data.org || data.connection?.org || data.ispName || 'No disponible';

            const ispResult = document.getElementById('isp-result');
            if (ispResult) ispResult.textContent = userISP;

            return;  // Éxito, no continuamos con fallbacks
        } catch (error) {
            console.warn(`IP API ${api} failed: ${error.message}`);
        }
    }
    // Si todos fallan (raro)
    ipElement.textContent = 'No disponible';
    ispElement.textContent = 'No disponible';
    cityElement.textContent = 'No disponible';
    countryElement.textContent = 'No disponible';
    asnElement.textContent = 'No disponible';
}

async function measureDownload() {
    const samples = [];

    for (let i = 0; i < DOWNLOAD_BYTES_SAMPLES.length; i += 1) {
        const bytes = DOWNLOAD_BYTES_SAMPLES[i];
        const testUrl = `${DOWNLOAD_TEST_URL}${bytes}?seed=${Date.now()}-${i}`;
        const start = performance.now();

        try {
            const response = await fetchWithTimeout(testUrl, {
                cache: 'no-store'
            }, 10000);

            if (!response.ok) throw new Error(`Download HTTP error: ${response.status}`);

            const buffer = await response.arrayBuffer();
            const duration = (performance.now() - start) / 1000;
            const mbps = (buffer.byteLength * 8) / duration / 1000000;
            if (Number.isFinite(mbps) && mbps > 0) samples.push(mbps);
        } catch (error) {
            console.error(`Download sample ${i} failed: ${error.message}`);
        }
    }

    // Fallback opcional si subes el archivo
    if (!samples.length && FALLBACK_DOWNLOAD_FILE) {
        try {
            const start = performance.now();
            const response = await fetchWithTimeout(FALLBACK_DOWNLOAD_FILE, { cache: 'no-store' }, 10000);
            if (!response.ok) throw new Error('Fallback download failed');
            const buffer = await response.arrayBuffer();
            const duration = (performance.now() - start) / 1000;
            const mbps = (buffer.byteLength * 8) / duration / 1000000;
            if (Number.isFinite(mbps) && mbps > 0) samples.push(mbps);
        } catch (error) {
            console.error(`Download fallback failed: ${error.message}`);
        }
    }

    const average = samples.reduce((acc, value) => acc + value, 0) / samples.length || 0;
    return { average, samples };
}

async function measureUpload() {
    const blob = new Blob([new Uint8Array(UPLOAD_SIZE_BYTES)], { type: 'application/octet-stream' });

    const start = performance.now();
    try {
        const response = await fetchWithTimeout(UPLOAD_TEST_URL, {
            method: 'POST',
            body: blob,
            cache: 'no-store'
        }, 10000);

        if (!response.ok) throw new Error(`Upload HTTP error: ${response.status}`);

        const duration = (performance.now() - start) / 1000;
        const mbps = (UPLOAD_SIZE_BYTES * 8) / duration / 1000000;
        if (Number.isFinite(mbps) && mbps > 0) return mbps;
    } catch (error) {
        console.error(`Upload failed: ${error.message}`);
    }

    return 0;
}

async function measurePingAndJitter() {
    const samples = [];

    for (let i = 0; i < 5; i += 1) {
        const start = performance.now();
        const url = i % 2 === 0 ? `${PING_TEST_URL}?cacheBust=${Date.now()}-${i}` : `${FALLBACK_PING_URL}?cacheBust=${Date.now()}-${i}`;
        try {
            await fetchWithTimeout(url, {
                cache: 'no-store'
            }, 2500);
        } catch (error) {
            console.error(`Ping sample ${i} failed: ${error.message}`);
        }
        samples.push(performance.now() - start);
    }

    const avg = samples.reduce((acc, value) => acc + value, 0) / samples.length || 0;
    const deltas = samples.slice(1).map((value, idx) => Math.abs(value - samples[idx]));
    const jitter = deltas.length ? deltas.reduce((acc, value) => acc + value, 0) / deltas.length : 0;

    return {
        ping: Math.round(avg),
        jitter: Math.round(jitter)
    };
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
        'Resultado de test de internet',
        `Descarga: ${document.getElementById('download')?.textContent || '0.00'} Mbps`,
        `Subida: ${document.getElementById('upload')?.textContent || '0.00'} Mbps`,
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
    if (backButton) backButton.hidden = !isInterviewMode;
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
        document.getElementById('ping').textContent = String(pingResult.ping);
        document.getElementById('avg-ping').textContent = String(pingResult.ping);
        document.getElementById('jitter').textContent = String(pingResult.jitter);

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
            document.getElementById('speed-class').textContent = getSpeedClassification(downloadMbps);
            updateGauge(downloadMbps);
        } else {
            document.getElementById('speed-class').textContent = 'No disponible';
            updateGauge(0);
        }

        if (uploadSettled.status === 'fulfilled') {
            uploadMbps = uploadSettled.value;
        }

        document.getElementById('download').textContent = formatNumber(downloadMbps);
        document.getElementById('upload').textContent = formatNumber(uploadMbps);
        document.getElementById('stability').textContent = String(stability);
        document.getElementById('isp-result').textContent = userISP;

        saveHistory({
            date: new Date().toLocaleDateString('es-AR'),
            download: formatNumber(downloadMbps),
            upload: formatNumber(uploadMbps),
            ping: String(pingResult.ping)
        });

        // SweetAlert que se muestra automáticamente al finalizar el test con éxito
        Swal.fire({
            title: '¡Test completado!',
            html: `
                <p style="font-size: 1.1rem; margin: 1rem 0;">
                    Este test mide <strong>la velocidad real que estás obteniendo ahora mismo</strong> 
                    con tu proveedor actual y en tu navegador cotidiano.
                </p>
                <p style="font-size: 1rem; color: #334155; margin: 1rem 0;">
                    Es decir: la velocidad que realmente experimentás al navegar, ver videos, jugar online o hacer videollamadas.
                </p>
                <p style="font-size: 0.95rem; color: #64748b;">
                    No usa trucos ni optimizaciones artificiales.<br>
                    Todos los resultados son calculados en tiempo real con tus datos actuales. Nada es aleatorio.
                </p>
                <p style="margin-top: 1.5rem; font-size: 0.9rem; color: #6b7280;">
                    Existen otras formas de medir la conexión, cada una con su enfoque.<br>
                    Esta herramienta está diseñada para mostrarte la realidad práctica y útil de tu uso diario.
                </p>
            `,
            icon: 'info',
            iconColor: '#0d6efd',
            confirmButtonText: 'Entendido',
            confirmButtonColor: '#0d6efd',
            allowOutsideClick: true,
            allowEscapeKey: true,
            showCloseButton: true,
            customClass: {
                popup: 'swal-wide',
                title: 'swal-title-custom',
                htmlContainer: 'swal-content-custom'
            }
        });

        progress.complete();
    } catch (error) {
        progress.stop();
        const loadingText = document.getElementById('loading-text');
        if (loadingText) loadingText.textContent = 'Error en la prueba. Reintentá.';
        console.error('Speed test error:', error);
        Swal.fire({
            title: 'Error en el test',
            text: 'No se pudieron completar las mediciones. Intenta de nuevo o verifica tu conexión.',
            icon: 'error',
            confirmButtonText: 'OK'
        });
    } finally {
        setTimeout(() => setLoadingState(false), 800);
        startButton.disabled = false;
        startButton.textContent = 'Volver a testear';
    }
}

async function fetchWithTimeout(url, options = {}, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error('Request timed out');
        }
        throw error;
    }
}

function init() {
    const startButton = document.getElementById('start-test');
    const interviewButton = document.getElementById('interview-mode');
    const backButton = document.getElementById('back-home');
    const copyButton = document.getElementById('copy-result');

    if (!startButton) {
        console.error("No se encontró el botón 'start-test'. Test no iniciará.");
        return;
    }

    startButton.addEventListener('click', startTest);
    if (interviewButton) interviewButton.addEventListener('click', () => toggleInterviewMode());
    if (backButton) backButton.addEventListener('click', () => toggleInterviewMode(false));
    if (copyButton) {
        copyButton.addEventListener('click', async () => {
            try {
                await copyResultToClipboard();
                copyButton.textContent = 'Resultado copiado ✅';
                setTimeout(() => {
                    copyButton.textContent = 'COPIAR RESULTADO PARA ENTREVISTA';
                }, 1400);
            } catch {
                copyButton.textContent = 'No se pudo copiar';
            }
        });
    }

    renderHistory();

    fetchConnectionData().catch(e => console.error("Error al obtener datos de conexión:", e));
}
window.addEventListener('DOMContentLoaded', init);