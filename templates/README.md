# AlterLab n8n Workflow Templates

5 production-ready n8n workflow templates using the [n8n-nodes-alterlab](https://www.npmjs.com/package/n8n-nodes-alterlab) community node. Each template is ready to import into n8n and publish to [n8n.io/workflows](https://n8n.io/workflows).

## Templates

| File | Description | Target Audience |
|------|-------------|-----------------|
| `scrape-ai-extract-google-sheets.json` | Scrape any website + AI extract structured data → Google Sheets | General / broadest use case |
| `monitor-competitor-prices-slack.json` | Monitor competitor prices daily → Slack alert when price drops | E-commerce, retail |
| `enrich-crm-leads-company-websites.json` | Enrich CRM leads by scraping company websites for B2B data | Sales teams, B2B |
| `track-google-serp-rankings.json` | Track Google SERP rankings weekly → Google Sheets | SEO teams, marketers |
| `scrape-reddit-sentiment-analysis.json` | Scrape Reddit mentions → AI sentiment analysis → Notion | Marketing, brand monitoring |

## How to Import in n8n

1. Open your n8n instance
2. Click **+ Add Workflow**
3. Click the **⋯ menu** (top right) → **Import from file**
4. Select the JSON file
5. Add your credentials (AlterLab API, Google Sheets, Slack, etc.)
6. Customize the input values (URLs, keywords, spreadsheet IDs)
7. Test with **Execute Workflow**

### Getting AlterLab Credentials

1. [Sign up free](https://app.alterlab.io/signin) — $1 free balance on signup (~5,000 scrapes)
2. Go to **Dashboard → API Keys** → copy your key
3. In n8n: **Credentials → New → AlterLab API** → paste key

## How to Publish to n8n.io/workflows (Manual Step)

Publishing templates to n8n.io requires a human action via the n8n creator portal.

### Prerequisites

- A registered n8n community account at [n8n.io](https://n8n.io)
- The workflow tested and working in your n8n instance
- The `n8n-nodes-alterlab` node installed in your n8n instance

### Submission Process

1. **Import and test the workflow** in your n8n instance (see above)
2. Verify the workflow executes successfully end-to-end
3. Go to the workflow in n8n editor
4. Click **⋯ menu** → **Copy Link** (or copy the workflow JSON)
5. Go to [n8n.io/workflows/submit](https://n8n.io/workflows/submit) (requires login)
6. Fill in:
   - **Workflow name**: Use the name from the JSON (includes "AlterLab" branding)
   - **Description**: Use the `description` field from the JSON
   - **Category**: Automation / Data & Storage / Web Scraping
   - **Community node**: `n8n-nodes-alterlab` (required — flag as community node template)
7. Submit for review — n8n reviews within a few business days

### Template Checklist Before Submission

- [ ] Workflow name includes "AlterLab"
- [ ] Description links to `https://app.alterlab.io/signin`
- [ ] AlterLab node uses correct credential type (AlterLab API or OAuth2)
- [ ] All credential placeholders have clear names (not generic "Credential 1")
- [ ] Workflow executes without errors (with valid credentials)
- [ ] Community node `n8n-nodes-alterlab` is flagged in submission

## Notes

- These templates target n8n v1.x with `executionOrder: v1`
- All templates use `n8n-nodes-alterlab` version `^0.12.0`
- Node IDs are pre-generated UUIDs — safe to import without conflicts
- Credential IDs in the JSON (`alterlab-api-credential`, etc.) are placeholders and will be replaced when you connect real credentials in n8n
