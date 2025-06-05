// server.js
import { Elysia } from 'elysia';
import { readFile, writeFile } from 'fs/promises';
import { existsSync, watch } from 'fs';

const app = new Elysia();

let products = [];
let reloadTimeout;

async function loadProducts() {
  try {
    if (!existsSync('output.json')) {
      console.error('❌ File output.json not found');
      return;
    }

    const data = await readFile('output.json', 'utf-8');
    products = JSON.parse(data);
    console.log(`✅ Reloaded ${products.length} products`);
  } catch (err) {
    console.error('Error loading products:', err.message);
  }
}

// Fungsi untuk setup file watcher
function setupFileWatcher() {
  // Hentikan watcher sebelumnya jika ada
  if (global.watcher) {
    global.watcher.close();
    console.log('🔄 Restarting file watcher');
  }
  
  try {
    // Setup watcher baru
    global.watcher = watch('output.json', (eventType, filename) => {
      if (eventType === 'change') {
        console.log(`\n📁 Detected change in ${filename}`);
        
        // Gunakan debounce untuk hindari multiple reloads
        clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(() => {
          console.log('🔄 Reloading products data...');
          loadProducts();
        }, 1000); // Tunggu 1 detik setelah perubahan terakhir
      }
    });
    
    console.log('👀 Watching output.json for changes...');
    global.watcher.on('error', (err) => {
      console.error('Watcher error:', err);
    });
  } catch (err) {
    console.error('Failed to start file watcher:', err);
  }
}

// Endpoint root untuk pengecekan
app.get('/', () => {
  return {
    status: 'running',
    message: 'Elysia Product API is running',
    endpoints: [
      'GET /products',
      'GET /products/search?q={query}',
      'GET /products/{itemId}',
      'POST /products/reload'
    ],
    product_count: products.length,
    last_reload: new Date().toISOString()
  };
});

// Endpoint: Daftar semua produk dengan paginasi
app.get('/products', ({ query }) => {
  // debug
  // const limit = Number(query.limit) || 10;
  // const offset = Number(query.offset) || 0;
  
  // debug
  // const result = products.slice(offset, offset + limit);
  const result = products;

  
  return {
    success: true,
    count: result.length,
    total: products.length,
    data: result,
    last_updated: new Date().toISOString()
  };
});

// Endpoint: Cari produk berdasarkan nama
app.get('/products/search', ({ query }) => {
  const q = query.q?.toLowerCase() || '';
  
  if (!q) {
    return {
      success: false,
      message: 'Search query required'
    };
  }

  const results = products.filter(product => 
    product.nama_produk?.toLowerCase().includes(q)
  );

  return {
    success: true,
    count: results.length,
    data: results,
    last_updated: new Date().toISOString()
  };
});

// Endpoint: Detail produk berdasarkan ID
app.get('/products/:itemId', ({ params }) => {
  const { itemId } = params;
  const product = products.find(p => p.nomor_item === itemId);

  if (!product) {
    return {
      success: false,
      message: 'Product not found'
    };
  }

  return {
    success: true,
    data: product,
    last_updated: new Date().toISOString()
  };
});

// Endpoint untuk memuat ulang data secara manual
app.get('/products/reload', async () => {
  try {
    await loadProducts();
    return {
      success: true,
      message: `Reloaded ${products.length} products`,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      success: false,
      message: 'Reload failed: ' + err.message
    };
  }
});

// Mulai server dengan port yang lebih umum
const startServer = async () => {
  // Muat data produk pertama kali
  await loadProducts();
  
  // Setup file watcher
  setupFileWatcher();
  
  const port = process.env.PORT || 3000;
  const host = 'localhost'; 
  
  app.listen({
    port,
    hostname: host
  }, () => {
    console.log(`🚀 Server running at http://${host}:${port}`);
    console.log('Endpoints:');
    console.log(`GET    http://${host}:${port}/`);
    console.log(`GET    http://${host}:${port}/products`);
    console.log(`GET    http://${host}:${port}/products/search?q={query}`);
    console.log(`GET    http://${host}:${port}/products/{itemId}`);
    console.log(`GET    http://${host}:${port}/products/reload`);
  });
  
  // Handle server shutdown
  process.on('SIGINT', () => {
    console.log('\n🔴 Shutting down server...');
    if (global.watcher) {
      global.watcher.close();
      console.log('👋 File watcher stopped');
    }
    process.exit(0);
  });
};

startServer();