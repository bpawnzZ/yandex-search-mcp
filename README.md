[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/Playwright-1.40-blue)](https://playwright.dev)
[![MCP](https://img.shields.io/badge/MCP-Compatible-brightgreen)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Unofficial](https://img.shields.io/badge/Unofficial-Community_Project-orange)](https://github.com/bpawnzZ/yandex-search-mcp)
[![GitHub Stars](https://img.shields.io/github/stars/bpawnzZ/yandex-search-mcp?style=social)](https://github.com/bpawnzZ/yandex-search-mcp)

```ascii
┌─────────────────────────────────────────────────────────────┐
│  🔍 Yandex Search MCP - Unofficial Community Project        │
│  ⚡ Powered by Playwright + TypeScript + MCP Framework       │
│  🚀 Enhanced with Content Extraction & LLM Context          │
└─────────────────────────────────────────────────────────────┘
```

> **⚠️ IMPORTANT DISCLAIMER**
> 
> This is an **unofficial community project** and is not affiliated with, endorsed by, or connected to:
> - **Yandex LLC** (the search engine provider)
> - **Anthropic** (creators of Claude and MCP)
> - **Google** (Playwright maintainers)
> 
> This tool uses browser automation to access Yandex search. Users are responsible for:
> - Complying with Yandex's Terms of Service
> - Respecting rate limits and bot policies
> - Using their own authentication cookies
> - Not using this tool for malicious purposes

## 📋 Table of Contents
- [✨ Features](#-features)
- [🚀 Quick Start](#-quick-start)
- [📦 Installation](#-installation)
- [🍪 Cookie Setup](#-cookie-setup)
- [⚙️ Configuration](#️-configuration)
- [🎯 Usage](#-usage)
- [🔧 Tools](#-tools)
- [🏗️ Architecture](#️-architecture)
- [🛠️ Troubleshooting](#️-troubleshooting)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## ✨ Features

### Core Capabilities

| Feature | Description | Status |
|---------|-------------|--------|
| 🔍 **Yandex Search** | Search Yandex with full parameter control | ✅ |
| 🕵️ **Stealth Mode** | Playwright with anti-detection plugins | ✅ |
| 🍪 **Cookie Auth** | Persistent authentication to bypass CAPTCHA | ✅ |
| 🌍 **Multi-region** | Support for yandex.com, .ru, .tr, etc. | ✅ |
| 🔒 **Safe Search** | Content filtering options | ✅ |

### Enhanced Features (v2.0)

| Feature | Description | Status |
|---------|-------------|--------|
| 📄 **Content Extraction** | Automatically fetch and extract page content | ✅ |
| 🧠 **Relevance Scoring** | AI-powered content ranking and prioritization | ✅ |
| 📊 **LLM Context Format** | Structured output optimized for LLMs | ✅ |
| 💾 **Smart Caching** | LRU cache with domain-specific TTLs | ✅ |
| 🎯 **Source Diversity** | Prevents domain clustering in results | ✅ |
| 📈 **Token Management** | Intelligent truncation with sentence preservation | ✅ |

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/bpawnzZ/yandex-search-mcp.git
cd yandex-search-mcp

# 2. Install dependencies
npm install

# 3. Build the project
npm run build

# 4. Configure cookies (see Cookie Setup section)
# 5. Add to MCP client configuration
# 6. Start searching! 🎉
```

## 📦 Installation

### Prerequisites

- Node.js 18+ 
- npm or yarn
- A Yandex account (for cookies)
- Cookie-Editor browser extension (or similar)

### Option 1: Clone and Build

```bash
git clone https://github.com/bpawnzZ/yandex-search-mcp.git
cd yandex-search-mcp
npm install
npm run build
```

### Option 2: Use with npx (after publishing)

```bash
npx yandex-search-mcp
```

## 🍪 Cookie Setup

### Why Cookies?

Yandex implements CAPTCHA challenges for automated requests. Using authenticated cookies allows the tool to bypass these challenges and perform searches seamlessly.

### Getting Your Cookies

1. **Install Cookie-Editor Extension:**
   - Chrome: [Cookie-Editor Extension](https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhcacofpbbnbalhlhf)
   - Firefox: [Cookie-Editor Add-on](https://addons.mozilla.org/en-US/firefox/addon/cookie-editor/)

2. **Log in to Yandex:**
   - Go to [yandex.com](https://yandex.com)
   - Log in to your Yandex account (or create one)
   - Perform a search to ensure cookies are set

3. **Export Cookies:**
   - Click the Cookie-Editor icon in your browser
   - Click the "Export" button (or JSON format)
   - Copy the JSON array

4. **Save Cookies:**
   - Paste the JSON into `cookies/yandex-cookies.json`
   - Ensure the file is valid JSON

### Sample Cookie File Structure

```json
[
  {
    "domain": ".yandex.com",
    "expirationDate": 1800000000.000000,
    "hostOnly": false,
    "httpOnly": true,
    "name": "Session_id",
    "path": "/",
    "sameSite": "no_restriction",
    "secure": true,
    "session": false,
    "storeId": null,
    "value": "YOUR_SESSION_ID_HERE"
  }
]
```

**Important:** Keep your cookies secure and don't commit them to public repositories!

## ⚙️ Configuration

### MCP Client Configuration

#### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "yandex-search": {
      "command": "node",
      "args": ["/path/to/yandex-search-mcp/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### Cline (VS Code Extension)

Add to `~/.kilocode/mcp.json`:

```json
{
  "mcpServers": {
    "yandex-search": {
      "command": "node",
      "args": ["/home/insomnia/git/yandex-search-mcp/dist/index.js"]
    }
  }
}
```

### Environment Variables

```bash
# Optional configuration
MAX_PAGES_PER_QUERY=5        # Default: 3
MAX_TOKENS_PER_PAGE=4000     # Default: 3000
CACHE_TTL_HOURS=24          # Default: 24
```

## 🎯 Usage

### Basic Search

```typescript
// Simple search - returns titles, URLs, snippets
{
  "tool": "yandex_search",
  "params": {
    "query": "artificial intelligence",
    "numResults": 10,
    "region": "com",
    "language": "en"
  }
}
```

### Enhanced Search with Content Extraction

```typescript
// Enhanced search - fetches and analyzes page content
{
  "tool": "yandex_search_enhanced",
  "params": {
    "query": "artificial intelligence benefits",
    "numResults": 5,
    "region": "com",
    "fetch_content": true,
    "max_pages": 3,
    "max_tokens_per_page": 3000,
    "analysis_level": "detailed",
    "context_format": "synthesized"
  }
}
```

### Output Formats

The enhanced tool supports multiple output formats:

| Format | Description | Use Case |
|--------|-------------|----------|
| `raw` | Full extracted content | When you need complete text |
| `summarized` | Condensed with key points | Quick overview |
| `synthesized` | Cross-source analysis (default) | Research and analysis |
| `qa_ready` | Question-answer format | Direct answers |

### Example Response (Synthesized)

```json
{
  "summary": "Based on 3 sources (12,456 words analyzed), here is what we found about \"artificial intelligence benefits\":",
  "key_findings": [
    {
      "source": "example.com",
      "finding": "AI increases productivity by 40% in manufacturing",
      "confidence": "high"
    }
  ],
  "synthesized_knowledge": "Synthesis of findings...",
  "source_references": [
    {
      "url": "https://example.com/ai-benefits",
      "title": "AI Benefits in 2026",
      "key_points": ["Increased productivity", "Cost reduction"],
      "relevance_note": "Relevance score: 85.3/100"
    }
  ],
  "metadata": {
    "query": "artificial intelligence benefits",
    "total_results": 500,
    "pages_fetched": 3,
    "successful_extractions": 3,
    "total_time_ms": 28500
  }
}
```

## 🔧 Tools

### yandex_search (Basic)

Simple search tool returning titles, URLs, and snippets.

**Parameters:**
- `query` (string, required): Search query
- `numResults` (number, optional): Number of results (default: 10, max: 50)
- `region` (string, optional): Region code (default: "com")
- `language` (string, optional): Language code (default: "en")
- `safeSearch` (boolean, optional): Enable safe search (default: true)

### yandex_search_enhanced (Advanced)

Full-featured search with content extraction and analysis.

**Parameters:**
- All basic parameters plus:
- `fetch_content` (boolean, optional): Fetch page content (default: true)
- `max_pages` (number, optional): Max pages to fetch (default: 3, max: 10)
- `max_tokens_per_page` (number, optional): Token limit per page (default: 3000)
- `analysis_level` (enum, optional): "basic" | "detailed" | "comprehensive"
- `context_format` (enum, optional): "raw" | "summarized" | "synthesized" | "qa_ready"

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Yandex Search MCP                          │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐     ┌──────────────────────────────────┐   │
│  │ Basic Search │     │        Enhanced Pipeline         │   │
│  │              │     │                                  │   │
│  │ • Search     │     │  ┌─────────────┐  ┌──────────┐   │   │
│  │ • Snippets   │     │  │   Browser   │→ │  Search  │   │   │
│  │ • URLs       │     │  │   Manager   │  │          │   │   │
│  └──────────────┘     │  └─────────────┘  └────┬─────┘   │   │
│                       │                        │         │   │
│                       │  ┌─────────────┐  ┌────▼─────┐   │   │
│                       │  │  Content    │  │ Extract  │   │   │
│                       │  │  Extractor  │←─┤ Content  │   │   │
│                       │  └─────────────┘  └────┬─────┘   │   │
│                       │                        │         │   │
│                       │  ┌─────────────┐  ┌────▼─────┐   │   │
│                       │  │  Relevance  │  │   Cache  │   │   │
│                       │  │   Scorer    │←─┤   (LRU)  │   │   │
│                       │  └─────────────┘  └──────────┘   │   │
│                       │                        │         │   │
│                       │  ┌──────────────────┐  │         │   │
│                       │  │  LLM Context     │←─┘         │   │
│                       │  │  Formatter       │            │   │
│                       │  └──────────────────┘            │   │
│                       │                        │         │   │
│                       │  ┌──────────────────┐  │         │   │
│                       │  │  Structured      │←─┘         │   │
│                       │  │  JSON Output     │            │   │
│                       │  └──────────────────┘            │   │
│                       └──────────────────────────────────┘   │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Key Components

1. **BrowserManager**: Singleton managing Playwright browser with stealth
2. **ContentExtractor**: Fetches and extracts meaningful content from pages
3. **RelevanceScorer**: Scores and ranks content by query relevance
4. **LLMContextFormatter**: Formats output for optimal LLM consumption
5. **ContentCache**: LRU cache with domain-specific TTLs

## 🛠️ Troubleshooting

### CAPTCHA Detected

**Symptom:** Results contain `error: 'CAPTCHA detected'`

**Solutions (in order of effectiveness):**

1. **Use Yandex Search API** (Recommended - 100% reliable):
   ```bash
   export YANDEX_SEARCH_API_KEY="your_api_key"
   export YANDEX_SEARCH_USER_ID="your_user_id"
   ```
   See [Yandex Search API Setup](#yandex-search-api-setup) below.

2. **Update Cookies**: Re-export fresh cookies from your browser
3. **Use Residential Proxy**: Datacenter IPs are often flagged
4. **Enable FlareSolverr**: Add `FLARESOLVERR_URL` environment variable

### Yandex Search API Setup

The most reliable way to avoid CAPTCHA is using the official Yandex Search API:

1. **Get API Credentials**:
   - Visit [Yandex Cloud Search API](https://yandex.cloud/en/docs/search-api/)
   - Create a service account
   - Generate an API key with `yandex.search-api.execute` scope
   - Note your User ID

2. **Configure MCP**:
   ```json
   {
     "mcpServers": {
       "yandex-search": {
         "command": "node",
         "args": ["/path/to/yandex-search-mcp/dist/index.js"],
         "env": {
           "YANDEX_SEARCH_API_KEY": "your_api_key_here",
           "YANDEX_SEARCH_USER_ID": "your_user_id_here"
         }
       }
     }
   }
   ```

3. **Benefits**:
   - No CAPTCHA challenges
   - 30,000 free requests per day
   - Faster response times
   - More reliable results

### Cookie Loading Errors

**Symptom:** `sameSite: expected one of (Strict|Lax|None)`

**Solution:** This is automatically handled by the cookie normalization in BrowserManager.

### Content Not Extracting

**Symptom:** Empty or minimal content from pages

**Possible Causes:**
- Heavy JavaScript (increase wait time)
- Login/paywall required
- Anti-scraping measures

### High Memory Usage

**Solution:**
- Reduce `max_pages` parameter
- Lower `max_tokens_per_page`
- Cache will automatically evict old entries

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Add comments for complex logic
- Update documentation for new features
- Test thoroughly before submitting

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [MCP Framework](https://mcp-framework.com) - The framework powering this tool
- [Playwright](https://playwright.dev) - Browser automation
- [Yandex](https://yandex.com) - Search engine (unofficial use)

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/bpawnzZ/yandex-search-mcp/issues)
- **Discussions:** [GitHub Discussions](https://github.com/bpawnzZ/yandex-search-mcp/discussions)

---

**Made with ⚡ by the community, for the community.**

*This is an unofficial tool. Please use responsibly and respect Yandex's Terms of Service.*
