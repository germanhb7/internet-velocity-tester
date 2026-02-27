// Configuración principal
const HISTORY_KEY = 'internetVelocityHistory';
const DOWNLOAD_BYTES_SAMPLES = [500000, 1000000, 2000000]; // Mantengo por si fallback, pero no se usa con ndt7
const UPLOAD_SIZE_BYTES = 1024 * 1024; // Mismo

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
        'https://ipapi.co/json/',
        'https://ipwho.is/',
        'https://freeipapi.com/api/json'
    ];

    for (const api of apis) {
        try {
            const res = await fetch(api);
            const data = await res.json();
            ipElement.textContent = data.ip || data.ipAddress || 'No disponible';
            ispElement.textContent = data.org || data.connection?.org || data.ispName || 'No disponible';
            cityElement.textContent = data.city || data.cityName || 'No disponible';
            countryElement.textContent = data.country_name || data.countryName || data.country || 'No disponible';
            asnElement.textContent = data.asn || data.connection?.asn || data.asNumber || 'No disponible';

            userCountry = data.country_name || data.countryName || data.country || 'No disponible';
            userISP = data.org || data.connection?.org || data.ispName || 'No disponible';

            const ispResult = document.getElementById('isp-result');
            if (ispResult) ispResult.textContent = userISP;

            return;
        } catch (error) {
            console.warn(`IP API ${api} failed: ${error.message}`);
        }
    }
    ipElement.textContent = 'No disponible';
    ispElement.textContent = 'No disponible';
    cityElement.textContent = 'No disponible';
    countryElement.textContent = 'No disponible';
    asnElement.textContent = 'No disponible';
}

async function runSpeedTest() {
    return new Promise((resolve, reject) => {
        let downloadMbps = 0;
        let uploadMbps = 0;
        let ping = 0;
        let jitter = 0;
        let downloadSamples = [];
        let uploadSamples = [];

        const testConfig = {
            protocol: 'wss',
            metadata: {
                client_name: 'internet-velocity-tester',
                client_version: '1.0.0',
                userAcceptedDataPolicy: true  // Aceptamos la política de M-Lab para datos reales
            }
        };

        const testCallbacks = {
            error: (err) => {
                console.error('NDT7 error:', err);
                reject(err);
            },

            downloadStart: () => setLoadingState(true, 'Midiendo descarga...'),
            downloadMeasurement: ({ source, data }) => {
                if (source === 'client') {
                    const mbps = data.MeanClientMbps;
                    if (mbps > 0) downloadSamples.push(mbps);
                }
            },
            downloadComplete: ({ lastClientMeasurement, lastServerMeasurement }) => {
                downloadMbps = lastClientMeasurement.MeanClientMbps || 0;
                ping = lastServerMeasurement.MinRTT || 0;  // RTT como ping
                jitter = lastServerMeasurement.LossRate * 100 || 0;  // Aproximación de jitter basada en loss
            },

            uploadStart: () => setLoadingState(true, 'Midiendo subida...'),
            uploadMeasurement: ({ source, data }) => {
                if (source === 'client') {
                    const mbps = data.MeanClientMbps;
                    if (mbps > 0) uploadSamples.push(mbps);
                }
            },
            uploadComplete: ({ lastClientMeasurement, lastServerMeasurement }) => {
                uploadMbps = lastClientMeasurement.MeanClientMbps || 0;
                resolve({ downloadMbps, uploadMbps, ping, jitter, downloadSamples, uploadSamples });
            }
        };

        ndt7.test(testConfig, testCallbacks);
    });
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

    // Pedir confirmación para "permiso" – explica que usa M-Lab y mide real
    const confirm = await Swal.fire({
        title: '¿Iniciar test real?',
        text: 'Este test usa servidores profesionales de Measurement Lab (M-Lab) para medir tu conexión real. Los datos anónimos contribuyen a estudios públicos de internet. ¿Aceptas?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, iniciar',
        cancelButtonText: 'Cancelar'
    });

    if (!confirm.isConfirmed) return;

    startButton.disabled = true;
    startButton.textContent = 'Midiendo...';
    setLoadingState(true, 'Iniciando diagnóstico real con M-Lab...');
    const progress = updateProgressSimulation();

    try {
        const { downloadMbps, uploadMbps, ping, jitter, downloadSamples, uploadSamples } = await runSpeedTest();

        document.getElementById('ping').textContent = String(ping);
        document.getElementById('avg-ping').textContent = String(ping);
        document.getElementById('jitter').textContent = String(jitter);

        const stability = calculateStability([...downloadSamples, ...uploadSamples]);  // Combinado para estabilidad general

        document.getElementById('download').textContent = formatNumber(downloadMbps);
        document.getElementById('upload').textContent = formatNumber(uploadMbps);
        document.getElementById('stability').textContent = String(stability);
        document.getElementById('isp-result').textContent = userISP;
        document.getElementById('speed-class').textContent = getSpeedClassification(downloadMbps);
        updateGauge(downloadMbps);

        saveHistory({
            date: new Date().toLocaleDateString('es-AR'),
            download: formatNumber(downloadMbps),
            upload: formatNumber(uploadMbps),
            ping: String(ping)
        });

        // SweetAlert original al finalizar
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