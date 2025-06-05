// Mengimpor modul yang diperlukan
import axios from 'axios'; // Untuk melakukan HTTP requests
import puppeteer from 'puppeteer-extra'; // Versi modifikasi Puppeteer untuk web scraping
import StealthPlugin from 'puppeteer-extra-plugin-stealth'; // Plugin untuk menghindari deteksi bot
import { load } from 'cheerio'; // Library untuk parsing dan manipulasi HTML/XML
import fs from 'fs/promises'; // Modul filesystem untuk operasi file async
import OpenAI from 'openai'; // Library untuk berinteraksi dengan API OpenAI
import dotenv from 'dotenv'; // Untuk load environment variables dari file .env

// Load environment variables dari file .env
dotenv.config();

// Gunakan plugin Stealth pada Puppeteer untuk menghindari deteksi
puppeteer.use(StealthPlugin());

// URL target dasar untuk scraping produk eBay (tanpa parameter halaman)
const baseUrl = "https://www.ebay.com/sch/i.html?_from=R40&_nkw=nike&_sacat=0&rt=nc";

// Inisialisasi klien OpenAI dengan konfigurasi khusus DeepSeek
const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com', // Endpoint alternatif DeepSeek
    apiKey: process.env.DEEPSEEK_API_KEY, // API key dari environment variable
});

// Fungsi untuk menghasilkan headers HTTP acak
const getRandomHeaders = () => {
    // Daftar user agent untuk berbagai browser dan perangkat
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36'
    ];
    
    // Daftar preferensi bahasa
    const acceptLanguages = [
        'en-US,en;q=0.9',
        'en-GB,en;q=0.8',
        'en-CA,en;q=0.7',
        'en-AU,en;q=0.6'
    ];
    
    // Return header dengan nilai acak
    return {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': acceptLanguages[Math.floor(Math.random() * acceptLanguages.length)],
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://www.ebay.com/'
    };
};

// Fungsi untuk scraping halaman produk eBay dengan pagination
const scrapePages = async (baseUrl, maxPages = null) => {
    const allLinks = [];
    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages) {
        // Jika maxPages diberikan dan currentPage melebihi maxPages, hentikan
        if (maxPages !== null && currentPage > maxPages) {
            console.log(`Reached maximum page limit (${maxPages})`);
            break;
        }

        try {
            console.log(`Scraping page ${currentPage}...`);
            const pageUrl = `${baseUrl}&_pgn=${currentPage}`;
            
            // Dapatkan headers acak
            const headers = getRandomHeaders();
            
            // Lakukan HTTP GET request ke URL target
            const response = await axios.get(pageUrl, {
                headers: headers,
                responseType: 'text',
                timeout: 15000 // Tambah timeout menjadi 15 detik
            });
            
            // Simpan HTML untuk debugging jika diperlukan
            // await fs.writeFile(`page-${currentPage}.html`, response.data);
            
            // Load HTML ke Cheerio untuk parsing
            const $ = load(response.data);
            const link_products = []; // Menyimpan link produk

            // PERBAIKAN UTAMA: Gunakan selector yang lebih robust
            $('.s-item').each((index, element) => {
                // Skip item pertama karena seringkali template
                if (index === 0) return;
                
                const productElement = $(element);
                // Ambil URL produk
                let url = productElement.find('.s-item__link').attr('href') || '';
                
                // Normalisasi URL
                if (url.startsWith('https://ebay.com/')) {
                    url = url.replace('https://ebay.com/', 'https://www.ebay.com/');
                }
                
                // Filter URL yang tidak valid
                if (!url || !url.includes('/itm/') || !url.match(/\/itm\/\d{9,}/)) {
                    return; // Skip jika bukan URL produk valid
                }
                
                // Bersihkan parameter URL
                const cleanUrl = url.split('?')[0];
                link_products.push(cleanUrl);
            });

            // Jika tidak ada produk di halaman ini, hentikan paginasi
            if (link_products.length === 0) {
                console.log(`No products found on page ${currentPage}, stopping pagination`);
                hasMorePages = false;
            } else {
                allLinks.push(...link_products);
                console.log(`Found ${link_products.length} products on page ${currentPage}`);
                
                // Cek apakah ada halaman berikutnya dengan cara yang lebih reliable
                const nextButton = $('.pagination__next');
                const isDisabled = nextButton.attr('aria-disabled') === 'true';
                
                if (!nextButton.length || isDisabled) {
                    console.log('No more pages available');
                    hasMorePages = false;
                }
            }
        } catch (err) {
            console.error(`Error scraping page ${currentPage}:`, err.message);
            // Jika error 404 atau 500, hentikan scraping
            if (err.response && [404, 500].includes(err.response.status)) {
                hasMorePages = false;
            }
        }
        
        // Tambahkan delay acak antara halaman
        const pageDelay = Math.floor(Math.random() * 5000) + 3000; // 3-8 detik
        await new Promise(resolve => setTimeout(resolve, pageDelay));
        
        currentPage++;
    }

    return allLinks;
};

// Fungsi untuk scraping detail produk individual
const scrapeProduct = async (productUrl, browserInstance) => {
    let page;
    try {
        // Buat halaman baru di browser
        page = await browserInstance.newPage();
        
        // Daftar viewport acak
        const viewports = [
            { width: 1920, height: 1080 },
            { width: 1366, height: 768 },
            { width: 1536, height: 864 },
            { width: 1440, height: 900 }
        ];
        // Set viewport acak
        const viewport = viewports[Math.floor(Math.random() * viewports.length)];
        await page.setViewport(viewport);
        
        // Daftar user agent desktop
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0'
        ];
        // Set user agent acak
        await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
        
        // Override properti navigator untuk hindari deteksi bot
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        });
        
        // Navigasi ke URL produk
        console.log(`Navigating to: ${productUrl}`);
        await page.goto(productUrl, {
            waitUntil: 'domcontentloaded', // Tunggu sampai DOM konten dimuat
            timeout: 30000 // Timeout 30 detik
        });
        
        // Tunggu elemen kunci muncul
        try {
            await page.waitForSelector('#mainContent, .tabs__content', {
                timeout: 20000,
                visible: true
            });
        } catch (e) {
            console.log('Key elements not found, proceeding anyway');
        }

        // Ekstrak konten HTML dari elemen penting
        const fixedElements = await page.evaluate(() => {
            // Fungsi helper untuk ambil innerHTML selector
            const getHtmlContent = (selector) => {
                const el = document.querySelector(selector);
                return el ? el.innerHTML.trim() : '';
            };

            return {
                mainContent: getHtmlContent('#mainContent'),
                tabsContent: getHtmlContent('.tabs__content')
            };
        });

        return {
            url: productUrl,
            fixedElements
        };
    } catch (error) {
        console.error(`Error scraping ${productUrl}:`, error.message);
        return null; // Return null jika error
    } finally {
        // Pastikan halaman ditutup setelah selesai
        if (page && !page.isClosed()) {
            await page.close();
        }
    }
};

// Fungsi untuk menunggu konten muncul dengan retry
const waitForContent = async (productData, browserInstance, maxRetries = 2, delayMs = 3000) => {
    let retries = 0;
    
    // Cek apakah konten utama sudah tersedia
    const isContentAvailable = productData.fixedElements.mainContent && 
                              productData.fixedElements.tabsContent;
    
    if (isContentAvailable) {
        return productData;
    }
    
    console.log('Main content or tabs content is empty, waiting...');
    
    // Lakukan retry sampai maxRetries tercapai
    while (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        console.log(`Retrying scrape (${retries + 1}/${maxRetries})...`);
        // Coba scraping ulang
        const newProductData = await scrapeProduct(productData.url, browserInstance);
        
        if (newProductData) {
            // Cek apakah konten sekarang lengkap
            if (newProductData.fixedElements.mainContent && 
                newProductData.fixedElements.tabsContent) {
                console.log('Both contents found!');
                return newProductData;
            }
        }
        
        retries++;
    }
    
    console.log('Max retries reached, content still incomplete');
    return productData; // Kembalikan data meskipun tidak lengkap
};

// Fungsi untuk memproses data dengan LLM (DeepSeek)
const llm_process = async (productData) => {
    try {
        // System prompt untuk menginstruksikan LLM
        const systemPrompt = `
        Anda adalah agen ekstraktor parser data dari tag HTML yang ahli dalam mengekstrak informasi produk dari tag HTML.
        Berdasarkan konten HTML yang diberikan, ekstrak informasi berikut dalam format JSON yang ditentukan.
        
        Aturan:
        1. Gunakan tanda minus "-" untuk nilai yang tidak ditemukan (bukan null)
        2. Ekstrak semua informasi yang mungkin dari konten HTML
        3. Untuk harga, ekstrak semua format mata uang yang tersedia
        4. Untuk ukuran, daftar semua opsi yang tersedia beserta status stok
        5. Untuk spesifikasi, ekstrak semua atribut yang tersedia
        
        Format output harus JSON dengan struktur berikut:
        {
          "nama_produk": "string",
          "harga": {
            "currency": "string",
            "nilai harga": "string",
            "harga_asli": "string",
            "diskon": "string"
          },
          "kondisi": "string",
          "detail_kondisi": "string",
          "penjual": {
            "nama": "string",
            "rating": "string",
            "jumlah_ulasan": "string",
            "lokasi": "string"
          },
          "pengiriman": {
            "biaya": "string",
            "metode": "string",
            "estimasi": "string",
            "duties": "string"
          },
          "kuantitas": {
            "tersedia": "string",
            "terjual": "string"
          },
          "ukuran": {
            "label": "string",
            "opsi": ["array of options"]
          },
          "spesifikasi": {
            "Condition": "string",
            "Closure": "string",
            "Occasion": "string",
            "Year Manufactured": "string",
            "Vintage": "string",
            "Department": "string",
            "Release Year": "string",
            "Style": "string",
            "Outsole Material": "string",
            "Features": "string",
            "Season": "string",
            "Shoe Shaft Style": "string",
            "Style Code": "string",
            "Pattern": "string",
            "Signed": "string",
            "Lining Material": "string",
            "Color": "string",
            "Brand": "string",
            "Type": "string",
            "Customized": "string",
            "Model": "string",
            "Theme": "string",
            "Shoe Width": "string",
            "Insole Material": "string",
            "Country/Region of Manufacture": "string",
            "Upper Material": "string",
            "Performance/Activity": "string",
            "Product Line": "string"
          },
          "nomor_item": "string",
          "deskripsi_url": "string"
        }
        `;

        // Gabungkan konten HTML untuk dikirim ke LLM
        const combinedContent = `
        URL PRODUK: ${productData.url}
        
        MAIN CONTENT:
        ${productData.fixedElements.mainContent}
        
        TABS CONTENT:
        ${productData.fixedElements.tabsContent}
        `;

        // Kirim permintaan ke API DeepSeek
        const response = await openai.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: combinedContent }
            ],
            model: "deepseek-chat", // Model yang digunakan
            response_format: { type: "json_object" }, // Format respons JSON
            temperature: 0.0 // Untuk output yang deterministik
        });

        // Parse respons JSON dari LLM
        const jsonResponse = JSON.parse(response.choices[0].message.content);
        return jsonResponse;
        
    } catch (error) {
        console.error('Error in llm_process:', error);
        return null;
    }
};

// Helper function untuk kontrol concurrency
const runWithConcurrency = async (tasks, concurrencyLimit) => {
    const results = [];
    const executing = new Set(); // Menyimpan promise yang sedang berjalan

    for (const task of tasks) {
        // Jalankan task dan simpan promise-nya
        const p = task().then(res => {
            executing.delete(p); // Hapus dari set setelah selesai
            return res;
        });

        executing.add(p);
        results.push(p);

        // Jika mencapai batas concurrency, tunggu salah satu selesai
        if (executing.size >= concurrencyLimit) {
            await Promise.race(executing);
        }
    }

    // Tunggu semua task selesai
    return Promise.allSettled(results);
};

// Fungsi utama yang dimodifikasi
const main = async () => {
    try {
        console.log("Starting eBay scraper...");
        
        // 1. Baca file output yang sudah ada (jika ada)
        let existingProducts = [];
        try {
            const existingData = await fs.readFile('output.json', 'utf-8');
            existingProducts = JSON.parse(existingData);
            console.log(`Loaded ${existingProducts.length} existing products from output.json`);
        } catch (error) {
            console.log('No existing output file found, creating new one');
        }

        // 2. Ekstrak URL yang sudah discrap dari data existing
        const scrapedUrls = new Set(existingProducts.map(p => p.url));
        
        // 3. Dapatkan link produk baru dari semua halaman
        console.log(`Scraping pages from: ${baseUrl}`);
        const productLinks = await scrapePages(baseUrl, 5); // debug Scrape hingga 5 page/halaman
        // const productLinks = await scrapePages(baseUrl); // Scrape semua page/halaman
        
        // 4. Filter hanya URL yang belum discrap
        // const linksToScrape = productLinks
        //     .filter(link => !scrapedUrls.has(link));
        // debug 3 produk saja yang discrape
        const linksToScrape = productLinks
            .filter(link => !scrapedUrls.has(link)).slice(0,3);
        
        console.log(`Found ${productLinks.length} products across pages`);
        console.log(`Scraping ${linksToScrape.length} new products`);
        
        // Jika tidak ada produk baru, hentikan proses
        if (linksToScrape.length === 0) {
            console.log("All products already scraped. Exiting.");
            return;
        }

        const newProducts = []; // Menyimpan hasil baru
        
        // Launch browser Puppeteer
        const browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080'
            ],
            ignoreHTTPSErrors: true
        });

        // Fungsi untuk memproses satu link produk
        const processLink = async (link) => {
            try {
                console.log(`Scraping ${link}...`);
                // Scrape data produk
                let productData = await scrapeProduct(link, browser);
                
                if (!productData) {
                    console.log(`❌ Failed to scrape: ${link}`);
                    return null;
                }
                
                console.log(`✅ Scraped: ${link}`);
                
                // Jika konten tidak lengkap, tunggu dengan retry
                if (!productData.fixedElements.mainContent || !productData.fixedElements.tabsContent) {
                    console.log('Waiting for content...');
                    productData = await waitForContent(productData, browser);
                }
                
                // Proses data dengan LLM
                console.log(`Processing with DeepSeek LLM...`);
                const processedData = await llm_process(productData);
                
                if (!processedData) {
                    console.log(`❌ Failed to process by LLM: ${link}`);
                    return null;
                }
                
                console.log(`✅ Processed by LLM: ${link}`);
                // Gabungkan data asli dengan hasil LLM
                return {
                    url: productData.url,
                    ...processedData
                };
            } catch (error) {
                console.error(`Error processing ${link}:`, error.message);
                return null;
            } finally {
                // Delay acak antara 5-10 detik antara request
                await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 5000) + 5000));
            }
        };

        // Buat array tugas scraping
        const scrapingTasks = linksToScrape.map(link => {
            return async () => processLink(link);
        });

        // Jalankan tugas secara paralel dengan batasan concurrency (3 tugas bersamaan)
        const results = await runWithConcurrency(scrapingTasks, 3);
        
        // Proses hasil
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                newProducts.push(result.value); // Tambahkan produk yang sukses
            } else if (result.status === 'rejected') {
                console.error('Task failed:', result.reason); // Log error
            }
        }

        // Tutup browser setelah selesai
        await browser.close();

        // 5. Gabungkan data baru dengan data existing
        const allProducts = [...existingProducts, ...newProducts];
        
        // 6. Simpan hasil gabungan ke file
        await fs.writeFile('output.json', JSON.stringify(allProducts, null, 2));
        console.log(`✅ Added ${newProducts.length} new products`);
        console.log(`💾 Total products saved: ${allProducts.length}`);
    } catch (error) {
        console.error('Error in main:', error);
    }
};

// Jalankan fungsi utama
await main();;