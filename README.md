# a11y-forge

[![npm version](https://img.shields.io/npm/v/a11y-forge.svg?style=flat-square)](https://www.npmjs.com/package/a11y-forge)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg?style=flat-square)](https://opensource.org/licenses/ISC)

**The AI-powered accessibility remediation engine for modern web applications.**

`a11y-forge` goes beyond simple linting. It combines headless browser scanning with Generative AI to **detect**, **analyze**, and **automatically fix** accessibility violations in your code.

---

<img width="1523" height="931" alt="Image" src="https://github.com/user-attachments/assets/13824513-18dc-4023-a8ee-10929805f158" />

## Why a11y-forge?

Web accessibility (a11y) is critical, but manual remediation is time-consuming and prone to error. Traditional tools like `axe-core` are great at *finding* problems, but they leave the *fixing* to you.

**a11y-forge changes that.**

Instead of just telling you "Image missing alt text," `a11y-forge` analyzes the image and the surrounding context to generate descriptive, meaningful alt text. Instead of flagging "Div used as button," it intelligently converts it to a semantic `<button>` or adds the necessary ARIA roles and keyboard handlers.

It's like having an accessibility expert pair-program with you, 24/7.

## ✨ Key Features

- **🤖 AI-Driven Fixes**: Leverages OpenAI (GPT-4o) to generate context-aware remediations for complex issues.
- **🛡️ Auto-Healing**: Automatically validates every fix. If a fix introduces invalid HTML, the engine "heals" it before applying.
- **⚡ Smart Caching**: Implements aggressive caching and request batching to minimize AI costs and latency.
- **🔄 Universal Support**: Works with React (`.tsx`, `.jsx`), Vue (`.vue`), and static HTML.
- **� Local & Remote**: Scan your local build folder (`./dist`) or audit any live URL.

## 📦 Installation

Install globally via npm:

```bash
npm install -g a11y-forge
```

Or run it directly with `npx`:

```bash
npx a11y-forge scan <target>
```

## 🚀 Usage

### 1. Scan and Fix Local Projects
Perfect for CI/CD pipelines or local development. Scan your build directory and apply fixes to your source code.

```bash
a11y-forge scan ./dist --apply
```

### 2. Audit a Live Website
Generate a comprehensive patch file for a remote URL.

```bash
a11y-forge scan https://example.com --output fixes.patch
```

### 3. Dry Run
Preview the changes without modifying any files.

```bash
a11y-forge scan ./dist --verify
```

## ⚙️ Configuration

To unlock the full power of AI remediation, set your OpenAI API key.

**Option 1: Global Config (Recommended)**
```bash
a11y-forge config set OPENAI_API_KEY sk-your-api-key
```

**Option 2: Environment Variable**
Create a `.env` file in your project root:
```env
OPENAI_API_KEY=sk-your-api-key
```

> **Note**: Without an API key, `a11y-forge` runs in "Deterministic Mode," applying only rule-based fixes.

## 🏗️ How It Works

1.  **Scan**: Puppeteer renders the page and captures the Accessibility Tree.
2.  **Detect**: The engine identifies WCAG 2.1/2.2 violations.
3.  **Resolve**: Issues are batched and sent to the AI model for semantic analysis.
4.  **Patch**: Fixes are applied to the source code using AST transformation and fuzzy matching.

## 📄 License

ISC © [Vibhanshu Garg](https://github.com/vibhanshu2001)
