# n8n-nodes-alterlab — Web Scraping Node for n8n

Scrape any website from n8n workflows. Handles anti-bot protection, JavaScript rendering, and structured data extraction automatically — so you don't have to.

**[Get Started Free →](https://app.alterlab.io/signin?redirect=/dashboard/keys&source=n8n&utm_source=n8n&utm_medium=integration&utm_campaign=community_node)** $1 free balance on signup. That's up to 5,000 scrapes.

---

## Why AlterLab Instead of HTTP Request Node?

The built-in HTTP Request node fails on most real websites. It can't bypass Cloudflare, render JavaScript, or handle CAPTCHAs. You end up chaining Browserless, proxy services, and custom code — then maintaining all of it.

AlterLab is one node. It handles everything:

- **Anti-bot bypass** — Cloudflare, DataDome, PerimeterX, Akamai, hCaptcha
- **JavaScript rendering** — Full headless Chromium for SPAs and dynamic content
- **Smart tier escalation** — Starts with the cheapest method, automatically upgrades only if the site blocks it
- **Structured extraction** — Returns clean JSON for products, articles, job listings, recipes, events
- **Markdown output** — LLM-ready content, ideal for AI agent workflows

## How Much Does It Cost?

Pay-as-you-go. No subscriptions, no monthly minimums. Add balance and use it whenever.

| Method | Cost per Scrape | What It Does |
|--------|----------------|--------------|
| Curl | $0.0002 | Static pages, RSS feeds, APIs |
| HTTP | $0.0003 | TLS fingerprinting for moderately protected sites |
| Stealth | $0.0005 | Browser impersonation for Cloudflare/DataDome |
| Light JS | $0.0007 | JSON extraction from server-rendered HTML |
| Browser | $0.001 | Full Chromium for JavaScript-heavy SPAs |

**$1 gets you 1,000 to 5,000 scrapes** depending on the sites you target. Most sites resolve at the cheapest tiers.

Optional add-ons per request:

| Add-On | Extra Cost | What It Does |
|--------|-----------|--------------|
| JS Rendering | +$0.0006 | Headless browser for dynamic content |
| Screenshot | +$0.0002 | Full-page PNG capture |
| PDF Export | +$0.0004 | Rendered page as downloadable PDF |
| OCR | +$0.001 | Text extraction from images |
| Premium Proxy | +$0.0002 | Residential proxy for geo-targeting |

## Quick Start

### Install

In your n8n instance: **Settings → Community Nodes → `n8n-nodes-alterlab` → Install**

Or via CLI:

```bash
npm install n8n-nodes-alterlab
```

### Connect Your Account

**Option A — One-click OAuth (recommended):**
1. Add an AlterLab node to your workflow
2. Click the credential dropdown → **Create New → AlterLab OAuth2 API**
3. Click **Connect** → sign in → done

**Option B — API key:**
1. [Sign up](https://app.alterlab.io/signin?redirect=/dashboard/keys&source=n8n&utm_source=n8n&utm_medium=integration&utm_campaign=community_node) and copy your API key
2. In n8n: **Credentials → New → AlterLab API** → paste key

### Scrape a Page

1. Add the **AlterLab** node to your workflow
2. Enter a URL
3. Run it

That's it. The node returns markdown, structured JSON, raw HTML, and metadata — ready for the next node in your workflow.

## What Can You Scrape?

### E-Commerce — Products, Prices, Reviews
Scrape Amazon, Walmart, Target, Best Buy, Shopify stores, and any product page. The **Product** extraction profile returns structured data: name, price, currency, rating, review count, availability, images.

### News & Articles — Full Text, Author, Date
Scrape news sites, blogs, and publications. The **Article** profile extracts: title, author, published date, body text as markdown, and featured image.

### Job Boards — Listings at Scale
Scrape Indeed, LinkedIn job posts, Glassdoor, and company career pages. The **Job Posting** profile returns: title, company, location, salary range, description, requirements.

### Any Website — With Custom Schemas
Define your own JSON schema or write natural language extraction prompts. AlterLab maps page content to your schema automatically.

## n8n Workflow Examples

### Price Monitoring Automation
**Schedule → AlterLab (Product profile) → Compare to Google Sheet → IF price dropped → Slack notification**

Monitor competitor prices daily. AlterLab handles the anti-bot protection on e-commerce sites. Compare extracted prices against stored values and alert your team when prices drop.

### AI-Powered Content Pipeline
**Schedule → AlterLab (Article profile, Markdown output) → OpenAI Summarize → Notion Database**

Scrape industry news sources, get clean markdown (not messy HTML), summarize with GPT, and store in your knowledge base. AlterLab's markdown output is optimized for LLM context windows.

### Lead Generation from Job Boards
**Schedule → AlterLab (Job Posting profile) → Filter by keywords → Airtable → Email notification**

Monitor job boards for roles that match your product. Extract structured listings, filter for relevant titles, and push qualified leads to your CRM.

### Competitor Intelligence Dashboard
**Schedule → AlterLab (Custom schema) → Compare to previous scrape → Google Sheets → Looker Studio**

Scrape competitor pages weekly. Define a custom schema for the data points you care about (pricing, features, team size). Track changes over time in a dashboard.

### Real Estate Monitoring
**Schedule → AlterLab (Custom schema) → IF new listing → Telegram notification**

Monitor property listing sites for new entries matching your criteria. Extract price, location, square footage, and images. Get notified the moment a matching property appears.

## Node Reference

### Inputs

| Parameter | Required | Description |
|-----------|----------|-------------|
| **URL** | Yes | The page to scrape |
| **Mode** | No | `auto` (default), `html`, `js`, `pdf`, `ocr` |

### Output Fields

Every scrape returns a flat JSON object you can reference directly in subsequent nodes:

```
{{ $json.markdown }}            — Clean markdown (best for LLMs)
{{ $json.text }}                — Plain text
{{ $json.json }}                — Structured data (Schema.org, extracted)
{{ $json.html }}                — HTML content
{{ $json.title }}               — Page title
{{ $json.filteredContent }}     — Custom schema extraction results
{{ $json.billing.cost }}        — Amount charged from balance
{{ $json.billing.tier }}        — Scraping method used
{{ $json.billing.suggestion }}  — Cost optimization tip
{{ $json.screenshotUrl }}       — Screenshot URL (if enabled)
{{ $json.pdfUrl }}              — PDF URL (if enabled)
```

### Advanced Options

| Option | Description |
|--------|-------------|
| **Extraction Profile** | Pre-built schemas: Product, Article, Job Posting, FAQ, Recipe, Event |
| **Extraction Prompt** | Natural language instructions for custom extraction |
| **Extraction Schema** | JSON Schema for structured output |
| **Cost Controls** | Set max spend per request, force specific tiers, prefer cost or speed |
| **Caching** | Cache responses from 60 seconds to 24 hours to reduce costs |
| **Proxy** | Route through residential proxies with geo-targeting (US, DE, GB, etc.) |

## Frequently Asked Questions

### How does AlterLab handle anti-bot protection?
AlterLab uses a multi-tier system that automatically escalates from simple HTTP requests to full browser automation. If a site blocks a basic request, it retries with TLS fingerprinting, then browser impersonation, then a full headless browser — all transparently. You just send a URL.

### Does it work with JavaScript-heavy sites like React or Angular apps?
Yes. Set mode to `js` or enable "Render JavaScript" in Advanced Options. AlterLab runs a full Chromium browser to render the page, then extracts content from the rendered DOM.

### Can I scrape sites behind Cloudflare?
Yes. The Stealth and Browser tiers handle Cloudflare, DataDome, PerimeterX, Akamai, and other anti-bot services. AlterLab's auto mode detects protection and escalates automatically.

### How is this different from Apify, Browserless, or ScrapingBee?
AlterLab starts at $0.0002/request (20x cheaper than most alternatives) because it only uses expensive browser rendering when actually needed. Most scraping APIs charge browser prices for every request. AlterLab's smart escalation means you only pay for what each site requires.

### Can I use it for large-scale scraping?
Yes. The node processes input items in a loop, so you can feed it hundreds of URLs from a spreadsheet, database query, or previous node. Use the Cache and Cost Controls options to manage spend at scale.

### Is there rate limiting?
Free tier has rate limits. Adding any balance removes them. Concurrent request limits scale with your balance.

### What output format works best for AI/LLM workflows?
Use `markdown` format (the default). It preserves document structure (headings, tables, lists) while being token-efficient. Most LLMs process markdown better than raw HTML.

## Support

- [API Documentation](https://docs.alterlab.io/api?utm_source=n8n&utm_medium=integration&utm_campaign=community_node)
- [Dashboard & Billing](https://app.alterlab.io/dashboard?utm_source=n8n&utm_medium=integration&utm_campaign=community_node)
- [support@alterlab.io](mailto:support@alterlab.io)

## License

MIT
