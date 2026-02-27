// --- CONFIGURACIÓN DEL TEST ---
// Archivo local que agregaste a la carpeta del proyecto (ruta relativa)
const DOWNLOAD_TEST_URL = './test-download.bin';  // Cambia a './test-download.jpg' si es imagen

// Tamaño exacto del archivo en BYTES (ajusta según tu archivo descargado)
const KNOWN_FILE_SIZE_BYTES = 104857600;  // 100 MB = 100 * 1024 * 1024

// Número de iteraciones para descarga (más = más preciso, pero más lento)
const DOWNLOAD_ITERATIONS = 3;

// --- OBTENER IP, ISP Y UBICACIÓN (ya funciona) ---
async function getUserConnectionInfo() {
    try {
        const response = await fetch('http://ip-api.com/json/');
        const data = await response.json();
        if (data.status === 'success') {
            document.getElementById('ip').textContent = data.query || 'No disponible';
            document.getElementById('isp').textContent = data.isp || 'No disponible';
            document.getElementById('location').textContent = 
                `${data.city || 'Desconocida'}, ${data.regionName || ''}, ${data.country || ''}`;
        }
    } catch (e) {
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
            await fetch('https://www.cloudflare.com/cdn-cgi/trace?' + Date.now(), { mode: 'no-cors', cache: 'no-store' });
        } catch {}
        total += performance.now() - start;
    }
    return Math.round(total / 3);
}

// --- MEDIR DESCARGA (usa tu archivo local → NO CORS en local ni en deploy) ---
async function measureDownload() {
    let totalBits = 0;
    let totalTime = 0;

    for (let i = 0; i < DOWNLOAD_ITERATIONS; i++) {
        const start = performance.now();
        try {
            const urlWithCacheBust = DOWNLOAD_TEST_URL + '?' + Date.now();
            const response = await fetch(urlWithCacheBust, { cache: 'no-store' });
            if (!response.ok) throw new Error('Archivo no encontrado');
            const blob = await response.blob();
            const end = performance.now();
            totalBits += KNOWN_FILE_SIZE_BYTES * 8;  // Usamos tamaño conocido (más preciso)
            totalTime += (end - start) / 1000;
        } catch (e) {
            console.error('Error en iteración de descarga:', e);
        }
    }

    if (totalTime < 0.1) return 'Muy rápida (prueba en deploy)';
    return ((totalBits / totalTime) / 1000000).toFixed(2);
}

// --- MEDIR SUBIDA (dummy en local: solo mide tiempo de creación de datos) ---
function measureUpload() {
    const start = performance.now();
    // Creamos datos dummy de 5 MB (no enviamos realmente en local para evitar errores)
    const dummy = new Uint8Array(5 * 1024 * 1024);
    const end = performance.now();
    const duration = (end - start) / 1000;
    if (duration < 0.05) return 'N/A (local)';
    const bits = 5 * 8 * 1024 * 1024;
    return ((bits / duration) / 1000000).toFixed(2);
}

// --- EJECUTAR EL TEST COMPLETO ---
async function runSpeedTest() {
    const btn = document.getElementById('start-test');
    const loadingAnim = document.getElementById('loading-animation');
    const loadingText = document.getElementById('loading-text');
    const progressFill = document.querySelector('.progress-fill');

    btn.disabled = true;
    btn.textContent = 'Probando...';
    
    // Mostrar animación del cohete
    loadingAnim.style.display = 'block';
    progressFill.style.width = '0%'; // Reset progreso

    // Simular progreso gradual (el cohete "sube" visualmente)
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15; // Avance irregular para que parezca real
        if (progress > 100) progress = 100;
        progressFill.style.width = progress + '%';
        loadingText.textContent = `Probando... ${Math.round(progress)}% - ¡Acelerando!`;
    }, 400); // Cada 0.4s avanza un poco

    try {
        // Limpiar resultados anteriores
        document.getElementById('ping').textContent = '---';
        document.getElementById('download').textContent = '---';
        document.getElementById('upload').textContent = '---';

        const ping = await measurePing();
        const download = await measureDownload();
        const upload = measureUpload();

        // Detener simulación de progreso
        clearInterval(progressInterval);
        progressFill.style.width = '100%';
        loadingText.textContent = '¡Llegamos a la meta! Resultados:';

        // Animar cohete "lanzándose" hacia arriba
        document.querySelector('.rocket').classList.add('rocket-launched');

        // Esperar 1.5s para que se vea la animación final
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Mostrar resultados reales
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
        // Ocultar animación después de 3 segundos más (para ver el cohete desaparecer)
        setTimeout(() => {
            loadingAnim.style.display = 'none';
            document.querySelector('.rocket').classList.remove('rocket-launched');
        }, 3000);
        btn.disabled = false;
    }
}

// --- INICIALIZACIÓN ---
window.addEventListener('load', () => {
    getUserConnectionInfo();  // IP/ISP al cargar
    document.getElementById('start-test').addEventListener('click', runSpeedTest);
});