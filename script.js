// --- CONFIGURACIÓN DEL TEST ---
// Archivo local en la carpeta del proyecto (ruta relativa)
// Cambia a './test-download.jpg' si usas una imagen en lugar de bin
const DOWNLOAD_TEST_URL = './test-download.bin';

// Tamaño exacto del archivo en BYTES (ajusta según tu archivo real)
// 100 MB = 100 * 1024 * 1024 = 104857600 bytes
const KNOWN_FILE_SIZE_BYTES = 104857600;

// Número de iteraciones para descarga (más = más preciso, pero más lento)
const DOWNLOAD_ITERATIONS = 3;

// --- OBTENER IP, ISP Y UBICACIÓN ---
async function getUserConnectionInfo() {
    try {
        const response = await fetch('https://ip-api.com/json/');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        if (data.status === 'success') {
            document.getElementById('ip').textContent = data.query || 'No disponible';
            document.getElementById('isp').textContent = data.isp || 'No disponible';
            document.getElementById('location').textContent =
                `${data.city || 'Desconocida'}, ${data.regionName || ''}, ${data.country || ''}`;
        } else {
            throw new Error(data.message || 'Fallo en la API');
        }
    } catch (e) {
        console.error('Error al obtener info de conexión:', e);
        document.getElementById('ip').textContent = 'Error';
        document.getElementById('isp').textContent = 'Error';
        document.getElementById('location').textContent = 'Error';
    }
}

// --- MEDIR PING (latencia aproximada, sin CORS) ---
async function measurePing() {
    let total = 0;
    for (let i = 0; i < 3; i++) {
        const start = performance.now();
        try {
            await fetch('https://www.cloudflare.com/cdn-cgi/trace?' + Date.now(), {
                mode: 'no-cors',
                cache: 'no-store'
            });
        } catch {} // Ignorar errores silenciosamente
        total += performance.now() - start;
    }
    return Math.round(total / 3);
}

// --- MEDIR DESCARGA (usa archivo local en deploy → real) ---
async function measureDownload() {
    let totalBits = 0;
    let totalTime = 0;

    for (let i = 0; i < DOWNLOAD_ITERATIONS; i++) {
        const start = performance.now();
        try {
            const urlWithCacheBust = DOWNLOAD_TEST_URL + '?' + Date.now();
            const response = await fetch(urlWithCacheBust, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Archivo no encontrado: ${response.status}`);
            }
            const blob = await response.blob();
            const end = performance.now();
            totalBits += KNOWN_FILE_SIZE_BYTES * 8;
            totalTime += (end - start) / 1000;
        } catch (e) {
            console.error('Error en iteración de descarga:', e);
        }
    }

    if (totalTime < 0.1) {
        return 'Muy rápida (prueba en deploy real)';
    }
    return ((totalBits / totalTime) / 1000000).toFixed(2);
}

// --- MEDIR SUBIDA (dummy por ahora – solo mide creación de datos) ---
function measureUpload() {
    const start = performance.now();
    // Datos dummy de 5 MB (no se envían realmente en esta versión)
    const dummy = new Uint8Array(5 * 1024 * 1024);
    const end = performance.now();
    const duration = (end - start) / 1000;

    if (duration < 0.05) {
        return 'N/A (local)';
    }

    const bits = 5 * 8 * 1024 * 1024;
    return ((bits / duration) / 1000000).toFixed(2);
}

// --- EJECUTAR EL TEST COMPLETO ---
async function runSpeedTest() {
    const btn = document.getElementById('start-test');
    const loadingAnim = document.getElementById('loading-animation');
    const loadingText = document.getElementById('loading-text');
    const progressFill = document.querySelector('.progress-fill');

    if (!btn || !loadingAnim || !loadingText || !progressFill) {
        console.error('Faltan elementos HTML para la animación/test');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Probando...';

    // Mostrar animación del cohete
    loadingAnim.style.display = 'block';
    progressFill.style.width = '0%'; // Reset progreso

    // Simular progreso gradual
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 100) progress = 100;
        progressFill.style.width = progress + '%';
        loadingText.textContent = `Probando... ${Math.round(progress)}% - ¡Acelerando!`;
    }, 400);

    try {
        // Limpiar resultados anteriores
        document.getElementById('ping').textContent = '---';
        document.getElementById('download').textContent = '---';
        document.getElementById('upload').textContent = '---';

        const ping = await measurePing();
        const download = await measureDownload();
        const upload = measureUpload();

        // Detener simulación y finalizar animación
        clearInterval(progressInterval);
        progressFill.style.width = '100%';
        loadingText.textContent = '¡Llegamos a la meta! Resultados:';

        // Animar despegue final del cohete
        document.querySelector('.rocket').classList.add('rocket-launched');

        // Esperar para que se vea la animación
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Mostrar resultados
        document.getElementById('ping').textContent = ping;
        document.getElementById('download').textContent = download;
        document.getElementById('upload').textContent = upload;

        btn.textContent = 'Volver a testear';

    } catch (e) {
        console.error('Error en el test:', e);
        clearInterval(progressInterval);
        loadingText.textContent = 'Error en la prueba 😔';
        btn.textContent = 'Reintentar';
    } finally {
        // Ocultar animación después de unos segundos
        setTimeout(() => {
            loadingAnim.style.display = 'none';
            document.querySelector('.rocket').classList.remove('rocket-launched');
        }, 3000);
        btn.disabled = false;
    }
}

// --- INICIALIZACIÓN ---
window.addEventListener('load', () => {
    getUserConnectionInfo(); // Cargar IP/ISP/ubicación al inicio
    const startButton = document.getElementById('start-test');
    if (startButton) {
        startButton.addEventListener('click', runSpeedTest);
    } else {
        console.error('Botón #start-test no encontrado');
    }
});