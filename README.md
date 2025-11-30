# a11y-forge: AI-Powered Accessibility Remediation Engine

**a11y-forge** is a powerful CLI tool that automates the detection and remediation of web accessibility issues. It combines headless browser scanning with Generative AI to not only find WCAG violations but also generate intelligent, context-aware fixes.

## 🚀 Key Features

- **🤖 AI-Powered Remediation**: Uses OpenAI (GPT-4o-mini) to generate accurate alt text, form labels, and validate semantic tag conversions.
- **✅ WCAG 2.1/2.2 Compliance**: Detects a wide range of issues including missing landmarks, color contrast, interactive roles, and heading structures.
- **⚡ Smart Optimization**: Implements request batching, deduplication, and persistent caching to reduce AI costs by up to 90% and speed up execution.
- **🛡️ Auto-Healing**: Automatically validates applied fixes and "heals" any syntax errors or invalid HTML introduced during the process.
- **🔄 Universal Patching**: Supports patching for React (`.tsx`, `.jsx`), Vue (`.vue`), and static HTML files.
- **📂 Local & Remote Scanning**: Scan local build directories (`./dist`) or live URLs.

## 📦 Installation

```bash
npm install -g a11y-forge
```

Or run directly with `npx`:

```bash
npx a11y-forge scan <target>
```

## ⚙️ Configuration

To enable AI features, you need to provide an OpenAI API Key. You can set this globally using the `config` command:

```bash
a11y-forge config set OPENAI_API_KEY sk-your-api-key-here
```

Alternatively, you can use a `.env` file in your project root:
```bash
OPENAI_API_KEY=sk-your-api-key-here
```

> **Note**: Without an API key, the tool will run in "Mock Mode", generating placeholder text for fixes.

## 🛠️ Usage

### 1. Scan and Auto-Fix Local Files
Scan a local directory (e.g., `./dist` or `./build`) and apply fixes directly to your source code.

```bash
a11y-forge scan ./dist --apply
```

### 2. Scan a Live URL
Scan a website and generate a git-compatible patch file.

```bash
a11y-forge scan https://example.com --output fixes.patch
```

### 3. CI/CD Integration
Run in CI mode to fail the build if severe accessibility issues are found.

```bash
a11y-forge scan ./dist --ci
```

### 4. Dry Run / Verification
Generate fixes and verify them without modifying files.

```bash
a11y-forge scan ./dist --verify
```

## 📝 CLI Options

| Option | Description |
|--------|-------------|
| `--fix` | Enable fix generation (Default: true) |
| `--no-fix` | Disable fix generation (Scan only) |
| `--apply` | Apply fixes directly to source files (Local only) |
| `--output <file>` | Save fixes to a patch file |
| `--verify` | Verify fixes without applying (Dry Run) |
| `--ci` | Exit with error code 1 if severe issues are found |

## 🏗️ Architecture

- **Scanner**: Uses Puppeteer to render pages and capture the Accessibility Tree.
- **Detector**: Analyzes the AX Tree against WCAG rules to identify violations.
- **Fixer**: Batches issues and queries OpenAI to generate semantic fixes.
- **Patcher**: Locates source code using fuzzy matching and AST analysis to apply changes safely.

## 📄 License

ISC
