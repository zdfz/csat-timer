# CSAT & Shipment Analytics Tool

A **5-step data processing workflow** built with **React 19**, **Vite**, and **Tailwind CSS**, deployed on **Netlify** with serverless functions. The tool automates the enrichment, filtering, merging, and cleaning of shipment data for Customer Satisfaction (CSAT) analysis by integrating with the **Starlinks** and **Shipsy** logistics APIs.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Workflow Steps](#workflow-steps)
  - [Step 1 — Mobile Enrichment](#step-1--mobile-enrichment)
  - [Step 2 — Delivered Filter](#step-2--delivered-filter)
  - [Step 3 — Courier Enrichment](#step-3--courier-enrichment)
  - [Step 4 — Merge Data](#step-4--merge-data)
  - [Step 5 — Clean & Deduplicate](#step-5--clean--deduplicate)
- [API Integrations](#api-integrations)
- [Reusable Components](#reusable-components)
- [Utility Functions](#utility-functions)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Development](#development)
  - [Production Build](#production-build)
- [Environment Variables](#environment-variables)
- [Deployment (Netlify)](#deployment-netlify)
- [Configuration Details](#configuration-details)

---

## Overview

The CSAT Tool provides an internal **step-by-step wizard** for operations teams to:

1. **Upload raw shipment Excel files** (exported from Fluent or similar systems).
2. **Enrich** each record with full shipment details by looking up mobile numbers via the Starlinks API.
3. **Filter** to keep only shipments delivered within a specific date range.
4. **Enrich** with courier/rider details (worker name, hub, delivery timeline) via the Shipsy API.
5. **Merge** shipment data with CSAT survey responses by matching on mobile numbers.
6. **Clean & deduplicate** the final dataset, producing a ready-to-analyze Excel file.

Each step produces a downloadable `.xlsx` file that feeds into the next step, creating a deterministic pipeline.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│  (Vite + Tailwind CSS + React Router + lucide-react)     │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Step 1   │→│  Step 2   │→│  Step 3   │→│  Step 4   │ │
│  │  Mobile   │  │ Delivered │  │ Courier   │  │  Merge   │ │
│  │ Enrichment│  │  Filter   │  │ Enrichment│  │  Data    │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│       │              │              │              │      │
│       ▼              ▼              ▼              ▼      │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              Netlify Serverless Functions             │ │
│  │  process-mobile-data  │  filter-delivered-shipments  │ │
│  │  process-couriers     │  merge-data                  │ │
│  │  clean-data                                          │ │
│  └──────────────────────────────────────────────────────┘ │
│       │              │                                    │
│       ▼              ▼                                    │
│  ┌─────────────┐  ┌─────────────┐                        │
│  │ Starlinks   │  │ Shipsy API  │                        │
│  │ API         │  │             │                        │
│  └─────────────┘  └─────────────┘                        │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌──────────────────┐
              │  Step 5: Clean   │
              │  & Deduplicate   │
              │  → Final .xlsx   │
              └──────────────────┘
```

**Data flow:** Each step uploads an Excel file → sends rows in batches to a Netlify function → the function calls the external API → enriched results are returned → the user downloads the output and feeds it to the next step.

---

## Tech Stack

| Layer            | Technology                                                     |
| ---------------- | -------------------------------------------------------------- |
| **Framework**    | React 19 with JSX                                              |
| **Build Tool**   | Vite 7                                                         |
| **Styling**      | Tailwind CSS 3.4 + custom design tokens                        |
| **Routing**      | React Router DOM 7 (BrowserRouter)                             |
| **HTTP Client**  | Axios                                                          |
| **Excel I/O**    | SheetJS (`xlsx`)                                               |
| **Icons**        | Lucide React                                                   |
| **Date Utility** | date-fns                                                       |
| **Typography**   | Euclid Circular B (local), Outfit + Inter (Google Fonts)       |
| **Backend**      | Netlify Functions (serverless, Node.js, esbuild bundler)       |
| **Deployment**   | Netlify (auto-build from repo)                                 |

---

## Workflow Steps

### Step 1 — Mobile Enrichment

**File:** `src/pages/Step1MobileEnrichment.jsx`
**Netlify Function:** `netlify/functions/process-mobile-data.js`
**API:** Starlinks — `GET https://starlinksapi.app/api/v1/shipments/get-list`

**What it does:**
1. User uploads a raw shipment Excel file (e.g., Fluent export).
2. The app **auto-detects** the mobile number column (searches for `mobile`, `phone`, `tel`, `cell`, `consignee phone`, etc.).
3. Rows are processed in **smart batches** (batch size 3, concurrency 2 workers) for optimal speed.
4. Each mobile number is **cleaned & standardized** to Saudi format (`966XXXXXXXXX`).
5. The Starlinks API returns all shipments for that mobile number.
6. Each shipment is **flattened** into a single row with enriched fields:
   - **Shipment info:** status, track number, customer name, service code, order reference, pricing, COD, dates.
   - **Consignee details:** name, phone, email, city, state, country, address.
   - **Shipper details:** name, phone, city, country, address.
   - **Parcel details:** description, warehouse, SKU, quantity, image URL (pipe-separated for multi-parcel).
7. User downloads the enriched file as `{originalName} | STEP 1.xlsx`.

**Features:**
- Real-time progress bar with **estimated time remaining**.
- Error handling per batch (non-blocking — other batches continue).

---

### Step 2 — Delivered Filter

**File:** `src/pages/Step2DeliveredFilter.jsx`
**Netlify Function:** `netlify/functions/filter-delivered-shipments.js`
**API:** Starlinks — `GET https://starlinksapi.app/api/v1/shipment/history`

**What it does:**
1. User uploads the output from Step 1.
2. Optionally sets a **date range** (From/To datetime pickers).
3. For each shipment (by `track_number`), the function fetches the **full event history** from Starlinks.
4. Filters to keep only shipments with a `Delivered` event within the date range.
5. Extracts a **delivery timeline** from history events:
   - `first_hub_scan` — First hub/facility/arrival/scan event.
   - `ofd_time` — Out for delivery event.
   - `first_delivery_attempt` / `last_delivery_attempt`.
   - `delivered_time`.
6. Output: `{originalName} | STEP 2.xlsx` containing only delivered shipments with timeline data.

**Features:**
- If no date range is specified, **all delivered shipments** are kept.
- Shows count of "Delivered in Range" after processing.

---

### Step 3 — Courier Enrichment

**File:** `src/pages/Step3CourierEnrichment.jsx`
**Netlify Function:** `netlify/functions/process-couriers.js`
**API:** Shipsy — `GET https://app.shipsy.in/api/client/integration/consignment/track`

**What it does:**
1. User uploads the output from Step 2.
2. For each `track_number`, the Shipsy API returns delivery events.
3. Extracts **rider/courier information** from the `delivered` event:
   - `worker_name`, `worker_code`, `worker_phone`, `vehicle_number`.
   - `hub_name`, `hub_code`, `location`.
   - `delivery_date`, `delivery_time`.
4. Extracts a **detailed timeline** (all times converted to Riyadh timezone):
   - `first_hub_scan_time_riyadh`
   - `ofd_time_riyadh`
   - `first_delivery_attempt_time_riyadh` / `last_delivery_attempt_time_riyadh`
   - `delivered_time_riyadh`
5. Output: `{originalName} | STEP 3.xlsx`.

---

### Step 4 — Merge Data

**File:** `src/pages/Step4Merge.jsx`
**Netlify Function:** `netlify/functions/merge-data.js`

**What it does:**
1. User uploads **two files side by side:**
   - **Main File** (Shipments) — typically the output from Step 3.
   - **Secondary File** (CSAT Responses) — the survey/feedback data from Fluent.
2. The mobile number column is **auto-detected** in both files, with a dropdown to override.
3. Mobile numbers are **normalized** to a common Saudi format for matching:
   - Removes whitespace, dashes, parentheses.
   - Handles Excel `.0` float artifacts.
   - Converts `05XXXXXXXX` → `9665XXXXXXXX`, `5XXXXXXXX` → `9665XXXXXXXX`.
4. Performs a **left join** (Cartesian product for multi-matches): every main row is kept, with secondary columns merged in.
   - Conflicting column names from the secondary file get a `_secondary` suffix.
5. Reports merge statistics: main rows, secondary rows, match count.
6. Output: `{originalName} | STEP 4.xlsx`.

**Notes:**
- Warns if payload exceeds 5 MB (Netlify Function limit).
- Includes debug metadata (sample keys, unmatched samples) for troubleshooting.

---

### Step 5 — Clean & Deduplicate

**File:** `src/pages/Step5Clean.jsx`
**Netlify Function:** `netlify/functions/clean-data.js`

**What it does:**
1. User uploads the output from Step 4.
2. **Auto-detects** the column to deduplicate by (searches for `track_number`, `tracking`, `shipment_id`, `mobile`, `phone`).
3. The user can change the dedup column or the keep strategy.
4. The function supports **three actions** (currently hardcoded to `dedup`):
   - **`clean`** — Trim strings, normalize whitespace, remove fully empty rows.
   - **`filter`** — Keep rows where delivery date and submission date are within N days.
   - **`dedup`** — Group rows by a key column and keep one per group (`first`, `last`, or `random`).
5. Reports stats: initial rows, removed, final rows.
6. Output: `{originalName} | CLEANED.xlsx` — the final, analysis-ready file.

---

## API Integrations

### Starlinks API

| Endpoint                                             | Used In    | Purpose                               |
| ---------------------------------------------------- | ---------- | ------------------------------------- |
| `GET /api/v1/shipments/get-list`                     | Step 1     | Look up shipments by mobile number    |
| `GET /api/v1/shipment/history`                       | Step 2     | Get event history by tracking number  |

- **Auth:** Bearer token via `Authorization` header.
- **Key env var:** `STARLINKS_API_KEY`

### Shipsy API

| Endpoint                                                  | Used In    | Purpose                              |
| --------------------------------------------------------- | ---------- | ------------------------------------ |
| `GET /api/client/integration/consignment/track`           | Step 3     | Track consignment for courier details |

- **Auth:** Custom `api-key` header.
- **Key env var:** `SHIPSY_API_KEY`

---

## Reusable Components

### `FileDropZone` — `src/components/FileDropZone.jsx`

A drag-and-drop file upload zone with click-to-browse fallback.

| Prop           | Type       | Default                | Description                       |
| -------------- | ---------- | ---------------------- | --------------------------------- |
| `onFileSelect` | `function` | *required*             | Callback receiving the file event |
| `label`        | `string`   | `"Drop Excel File Here"` | Display label text              |
| `accept`       | `string`   | `".xlsx,.xls"`         | Accepted file types               |

### `ProgressBar` — `src/components/ProgressBar.jsx`

An animated progress bar with label and percentage display.

| Prop      | Type     | Default  | Description                            |
| --------- | -------- | -------- | -------------------------------------- |
| `current` | `number` | —        | Current progress count                 |
| `total`   | `number` | —        | Total items                            |
| `label`   | `string` | —        | Description text above the bar         |
| `color`   | `string` | `"blue"` | Color theme: `blue`, `indigo`, `green`, `teal`, `yellow` |

### `Stepper` — `src/components/Stepper.jsx`

A horizontal step indicator showing completed, current, and upcoming steps with checkmarks.

| Prop          | Type     | Default | Description                   |
| ------------- | -------- | ------- | ----------------------------- |
| `steps`       | `array`  | —       | Array of `{ title }` objects  |
| `currentStep` | `number` | —       | 1-indexed current step number |

---

## Utility Functions

### `src/utils/excel.js`

| Function                    | Description                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| `readExcel(file)`           | Reads an Excel file (`.xlsx`/`.xls`) and returns JSON array of rows  |
| `writeExcel(data, filename)`| Converts JSON array to Excel workbook and triggers download          |
| `findColumnCaseInsensitive(row, candidates)` | Finds a matching column name from a list of candidates (case-insensitive) |

### `src/utils/fileName.js`

| Function                     | Description                                                             |
| ---------------------------- | ----------------------------------------------------------------------- |
| `getCleanFileName(name)`     | Strips previous step suffixes (e.g., ` | STEP 1`, `_STEP 2`) from filenames for clean re-use |

---

## Project Structure

```
csat-tool/
├── index.html                          # HTML entry point (React root mount)
├── package.json                        # Dependencies & scripts
├── vite.config.js                      # Vite config with Netlify proxy
├── tailwind.config.js                  # Tailwind design tokens & theme
├── postcss.config.js                   # PostCSS with Tailwind plugin
├── netlify.toml                        # Netlify build & functions config
├── deno.lock                           # Deno lockfile
├── .gitignore
│
├── public/
│   ├── favicon.png                     # App favicon
│   └── vite.svg                        # Vite logo asset
│
├── src/
│   ├── main.jsx                        # React entry — BrowserRouter + StrictMode
│   ├── App.jsx                         # Root layout — sidebar nav + routing
│   ├── style.css                       # Global styles — @font-face + Tailwind layers
│   ├── output.css                      # Compiled Tailwind output
│   │
│   ├── assets/
│   │   ├── fonts/                      # Euclid Circular B font files (.ttf)
│   │   └── images/                     # Logo and other image assets
│   │
│   ├── components/
│   │   ├── FileDropZone.jsx            # Drag-and-drop file upload
│   │   ├── ProgressBar.jsx             # Animated progress indicator
│   │   └── Stepper.jsx                 # Horizontal step indicator
│   │
│   ├── pages/
│   │   ├── Step1MobileEnrichment.jsx   # Step 1: Mobile number lookup
│   │   ├── Step2DeliveredFilter.jsx    # Step 2: Delivery date filtering
│   │   ├── Step3CourierEnrichment.jsx   # Step 3: Courier/rider details
│   │   ├── Step4Merge.jsx              # Step 4: Shipment ↔ CSAT merge
│   │   └── Step5Clean.jsx              # Step 5: Deduplication & cleanup
│   │
│   └── utils/
│       ├── excel.js                    # Excel read/write/column-find helpers
│       └── fileName.js                 # Filename sanitization utility
│
└── netlify/
    └── functions/
        ├── process-mobile-data.js      # Step 1 serverless function
        ├── filter-delivered-shipments.js# Step 2 serverless function
        ├── process-couriers.js         # Step 3 serverless function
        ├── merge-data.js              # Step 4 serverless function
        └── clean-data.js             # Step 5 serverless function
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** (comes with Node.js)
- (Optional) **Netlify CLI** for local serverless function testing

### Installation

```bash
# Clone the repository
git clone https://github.com/zdfz/csat-tool.git
cd csat-tool

# Install dependencies
npm install
```

### Development

**Frontend only** (API calls will proxy to `localhost:8888`):

```bash
npm run dev
```

**Full stack with Netlify Functions:**

```bash
# Install Netlify CLI globally (if not installed)
npm install -g netlify-cli

# Start both frontend and serverless functions
netlify dev
```

This starts:
- Vite dev server on `http://localhost:5173` (frontend)
- Netlify Functions on `http://localhost:8888` (backend)
- Vite proxies `/.netlify/functions/*` requests to the functions server

### Production Build

```bash
npm run build    # Outputs to dist/
npm run preview  # Preview the production build locally
```

---

## Environment Variables

Set these in your Netlify dashboard under **Site Settings → Environment Variables**, or in a local `.env` file:

| Variable           | Description                               | Required |
| ------------------ | ----------------------------------------- | -------- |
| `STARLINKS_API_KEY`| API key for Starlinks shipment lookups     | Yes      |
| `SHIPSY_API_KEY`   | API key for Shipsy courier tracking        | Yes      |

> **Note:** The codebase includes fallback API keys for development purposes. In production, always set these via environment variables for security.

---

## Deployment (Netlify)

The project is configured for **automatic deployment** on Netlify:

1. Connect your GitHub repository to Netlify.
2. Netlify reads `netlify.toml` for build settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Functions directory:** `netlify/functions` (bundled with esbuild)
3. Set the required [environment variables](#environment-variables) in the Netlify dashboard.
4. Push to your main branch — Netlify auto-builds and deploys.

---

## Configuration Details

### Tailwind CSS Theme

The project uses a custom design system defined in `tailwind.config.js`:

- **Primary color:** Green palette (`#1f6a4a` main) with full shade range (50–950).
- **Secondary color:** Orange/amber palette (`#ff9d18` main).
- **Neutral palette:** Standard gray scale with white opacity variants.
- **Fonts:** `Euclid Circular B` (body), `Outfit` (headings/display).
- **Custom shadows:** `premium` (subtle card shadow), `glow` (indigo glow).
- **Animations:** `fade-in` (opacity), `slide-up` (translate + opacity).

### Vite Configuration

- **React plugin** (`@vitejs/plugin-react`) for JSX and Fast Refresh.
- **Dev proxy:** Routes `/.netlify/functions/*` to `http://localhost:8888` for local function testing.

### Component CSS Classes

Custom Tailwind component classes defined in `src/style.css`:

| Class          | Purpose                                              |
| -------------- | ---------------------------------------------------- |
| `.btn-primary` | Green primary button with hover lift + active scale  |
| `.btn-secondary` | White outlined button with subtle hover states     |
| `.card`        | White card with border, premium shadow, transitions  |
| `.input-field` | Styled input with focus ring and border transitions  |
