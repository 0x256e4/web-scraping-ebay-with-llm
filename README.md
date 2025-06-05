# eBay Product Scraper with AI Processing

Proyek ini melakukan scraping produk eBay dan memproses datanya menggunakan DeepSeek AI untuk mengekstrak informasi terstruktur dalam format JSON.

## Fitur Utama
- ✅ Scraping halaman produk eBay dengan rotasi header dan viewport
- ✅ Penggunaan Puppeteer Stealth untuk menghindari deteksi bot
- ✅ Ekstraksi data terstruktur menggunakan LLM DeepSeek
- ✅ Concurrency control untuk scraping paralel
- ✅ Penyimpanan hasil akhir dalam format JSON

## Teknologi
- Runtime JavaScript: **Bun** (v1.2.15)
- Libraries:
  - `puppeteer-extra` + `stealth-plugin`
  - `axios`
  - `cheerio`
  - `openai` (DeepSeek API)
  - `dotenv`

## Struktur File Penting
```bash
├── .env # Environment variables (dibuat manual)
├── index.js # Script scraping
├── server.js # Script server restAPI
├── output.json # Sample output (yang sudah tergenerate setelah dijalankan sebelumnya)
└── README.md
```

## Cara Menggunakan

### 1. Setup Awal
```bash
# Clone repositori
git clone https://github.com/0x256e4/web-scrape-ebay.git
cd web-scrape-ebay

# Instal Depedensi
bun install puppeteer-extra puppeteer-extra-plugin-stealth axios cheerio openai dotenv
```

### 2. Setup API Key LLM
- Isi API Key pada your_api_key_here di file .env tanpa tanda kutip:
```bash
DEEPSEEK_API_KEY=your_api_key_here
```

### 3. Menjalankan Scraper
```bash
bun start
```

### 4. Menjalankan Server RestAPI
```bash
bun serve
```