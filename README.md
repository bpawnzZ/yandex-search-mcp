# Yandex Search MCP

[![MCP](https://img.shields.io/badge/MCP-Framework-blue)](https://mcp-framework.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.40-green)](https://playwright.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Model Context Protocol (MCP) server that enables AI assistants to perform web searches using Yandex. Built with Playwright for reliable browser automation and stealth capabilities.

## Overview

This MCP server provides a `yandex_search` tool that allows AI assistants like Claude to search the web via Yandex. It uses Playwright with stealth plugins to bypass bot detection and provides real-time search results in a structured format.

## Features

- **Web Search**: Search Yandex with customizable parameters
- **Stealth Mode**: Uses Playwright with stealth plugins to avoid detection
- **Cookie Persistence**: Maintain session state across searches
- **Configurable**: Support for different regions, languages, and result counts
- **Safe Search**: Optional content filtering
- **Structured Output**: JSON-formatted search results

## Prerequisites

- Node.js 18+ 
- npm or yarn
- A Yandex account (for cookies)
- Cookie-Editor browser extension (or similar)

## Installation

### Option 1: Clone and Build

```bash
# Clone the repository
git clone https://github.com/yourusername/yandex-search-mcp.git
cd yandex-search-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

### Option 2: Use with npx (after publishing)

```bash
npx yandex-search-mcp
```

## Cookie Setup

This tool requires Yandex authentication cookies to perform searches. Follow these steps to obtain and configure them:

### Step 1: Install Cookie-Editor

1. Install the [Cookie-Editor extension](https://cookie-editor.com/) for your browser:
   - [Chrome](https://chrome.google.com/webstore/detail/cookie-editor/hlkenndedknhfedapcpdkecmffpgnbdf)
   - [Firefox](https://addons.mozilla.org/en-US/firefox/addon/cookie-editor/)
   - [Edge](https://microsoftedge.microsoft.com/addons/detail/cookie-editor/ajfboajkfmjjpkejkchjdkjpjdmcgoii)

### Step 2: Get Cookies from Yandex

1. Go to [yandex.com](https://yandex.com) and log in to your account
2. Perform a search to ensure your session is active
3. Click on the Cookie-Editor extension icon
4. Click **"Export"** → **"Export as JSON"**
5. Copy the exported JSON

### Step 3: Configure Cookies

1. Open `cookies/yandex-cookies.json` in the project directory
2. Paste your exported cookies, or replace the placeholder values:
   - `Session_id`: Your Yandex session ID
   - `yandexuid`: Your Yandex user ID
   - `is_gdpr`: GDPR consent flag (usually "0")

**Example cookie structure:**
```json
[
  {
    "domain": ".yandex.com",
    "name": "Session_id",
    "value": "3:1772401761.5.0...",
    "path": "/",
    "secure": true,
    "httpOnly": true
  },
  {
    "domain": ".yandex.com",
    "name": "yandexuid",
    "value": "1234567890123456789",
    "path": "/",
    "secure": true
  }
]
```

> **Security Note**: Never commit your real cookies to version control. The cookies file is already in `.gitignore` for your protection.

## MCP Configuration

Add the following configuration to your MCP client (Claude Desktop, Cline, etc.):

### Claude Desktop

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "yandex-search": {
      "command": "node",
      "args": ["/absolute/path/to/yandex-search-mcp/dist/index.js"]
    }
  }
}
```

### Cline (VS Code Extension)

Add to your Cline MCP settings:

```json
{
  "mcpServers": {
    "yandex-search": {
      "command": "node",
      "args": ["/absolute/path/to/yandex-search-mcp/dist/index.js"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Usage Examples

### Basic Search

```
Search for "TypeScript best practices" using Yandex
```

### Advanced Search with Parameters

```
Search Yandex for "machine learning tutorials" with 20 results in Russian
```

### Tool Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | The search query to execute |
| `numResults` | number | 10 | Number of results to return (max: 50) |
| `region` | string | "com" | Yandex region (com, ru, tr, etc.) |
| `language` | string | "en" | Language for search results |
| `safeSearch` | boolean | true | Enable safe search filter |

### Example Output

```json
{
  "results": [
    {
      "title": "TypeScript Best Practices for Clean Code",
      "url": "https://example.com/typescript-best-practices",
      "snippet": "Learn the essential TypeScript best practices for writing clean, maintainable code..."
    },
    {
      "title": "10 TypeScript Tips for Better Code",
      "url": "https://example.com/typescript-tips",
      "snippet": "Improve your TypeScript development with these proven tips and tricks..."
    }
  ],
  "total": 2,
  "query": "TypeScript best practices",
  "region": "com"
}
```

## How It Works

### Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│   MCP Client │────▶│ YandexSearchTool │────▶│ BrowserManager│
│  (Claude/etc)│     │   (MCP Tool)     │     │  (Playwright) │
└─────────────┘     └─────────────────┘     └──────┬───────┘
                          │                        │
                          │                        ▼
                          │                 ┌──────────────┐
                          │                 │ Yandex.com   │
                          │                 │ (Search)     │
                          │                 └──────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │ Cookie Store │
                   │ (JSON File)  │
                   └──────────────┘
```

### Technical Details

1. **BrowserManager**: Singleton class managing Playwright browser instance with stealth plugins
2. **Cookie Loading**: Authentication cookies loaded from `cookies/yandex-cookies.json`
3. **Search Execution**: Playwright navigates to Yandex, performs search, extracts results
4. **Result Parsing**: HTML parsed to extract titles, URLs, and snippets
5. **Stealth Mode**: puppeteer-extra-plugin-stealth helps avoid bot detection

### Browser Configuration

The tool uses Playwright with the following stealth measures:
- User agent spoofing
- Webdriver property hiding
- Plugin list emulation
- Screen size consistency

## Troubleshooting

### "Session expired" or "Authentication required"

- Re-export fresh cookies from Yandex
- Ensure you're logged in to yandex.com
- Check that cookies file path is correct

### "No results found"

- Verify your Yandex account can perform searches manually
- Check if Yandex has updated their page structure (may need code update)
- Try different search queries

### "Browser launch failed"

- Ensure Playwright browsers are installed: `npx playwright install chromium`
- Check for port conflicts on debug port (9222)
- Verify Node.js version is 18+

### "Request blocked" or CAPTCHA

- Cookies may have expired; refresh them
- Yandex may have detected automation; wait a few minutes
- Try using a different Yandex account

### Development Mode

To run in development with auto-rebuild:

```bash
npm run watch
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Setup

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch for changes
npm run watch
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [mcp-framework](https://mcp-framework.com)
- Browser automation powered by [Playwright](https://playwright.dev)
- Stealth capabilities from [puppeteer-extra-plugin-stealth](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)

## Disclaimer

This tool is for educational and personal use. Please respect Yandex's Terms of Service and use responsibly. The authors are not responsible for any misuse of this software.
