import puppeteer, { Browser, Page } from 'puppeteer';
import { Snapshot, AXNode, ComputedStyles } from '../../types';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

export class Scanner {
    private browser: Browser | null = null;

    async init() {
        this.browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async scan(target: string): Promise<Snapshot[]> {
        if (!this.browser) {
            await this.init();
        }

        if (target.startsWith('http')) {
            return this.crawlUrl(target);
        } else {
            return this.crawlFolder(target);
        }
    }

    private async crawlFolder(folderPath: string): Promise<Snapshot[]> {
        const snapshots: Snapshot[] = [];
        // Resolve absolute path
        const absPath = path.resolve(folderPath);

        // Start static server
        const { StaticServer } = require('./server');
        const server = new StaticServer(absPath);
        const baseUrl = await server.start();
        console.log(`Started local server at ${baseUrl}`);

        try {
            if (fs.statSync(absPath).isFile()) {
                // If it's a single file, we need to serve its parent dir to handle relative assets?
                // Or just scan it directly if it has no assets.
                // But the user usually scans a folder (dist).
                // If single file, let's just try file:// for now or handle it better later.
                // Actually, if it's a file, the server root should be the parent dir.
                // Let's keep it simple: if file, just scan file://. If folder, use server.
                await server.stop(); // Stop unused server
                return [await this.scanPage(`file://${absPath}`, absPath)];
            }

            // Find all HTML files
            const files = await glob('**/*.html', { cwd: absPath, absolute: true });
            console.log(`Found ${files.length} HTML files in ${folderPath}`);

            for (const file of files) {
                try {
                    // Calculate relative path to construct URL
                    const relPath = path.relative(absPath, file);
                    // Ensure forward slashes for URL
                    const urlPath = relPath.split(path.sep).join('/');
                    const url = `${baseUrl}/${urlPath}`;

                    const snapshot = await this.scanPage(url, file);
                    snapshots.push(snapshot);
                } catch (e) {
                    console.error(`Failed to scan file ${file}:`, e);
                }
            }
        } finally {
            await server.stop();
        }
        return snapshots;
    }

    private async crawlUrl(startUrl: string, maxDepth: number = 2): Promise<Snapshot[]> {
        const snapshots: Snapshot[] = [];
        const visited = new Set<string>();
        const queue: { url: string, depth: number }[] = [{ url: startUrl, depth: 0 }];
        const domain = new URL(startUrl).hostname;

        while (queue.length > 0) {
            const { url, depth } = queue.shift()!;
            if (visited.has(url)) continue;
            visited.add(url);

            console.log(`Crawling: ${url} (Depth: ${depth})`);

            try {
                const snapshot = await this.scanPage(url);
                snapshots.push(snapshot);

                if (depth < maxDepth) {
                    // Extract links
                    // We can use the DOM tree we already parsed, or regex, or puppeteer evaluation.
                    // Since we have the page open in scanPage, we should probably extract links there.
                    // But scanPage closes the page.
                    // Let's modify scanPage or just extract links from the snapshot HTML/DOM if possible.
                    // For now, let's just use a simple regex on the HTML content for speed, 
                    // or better, let scanPage return links.
                    // To keep Snapshot interface clean, let's re-parse HTML or just use regex.

                    const linkRegex = /href=["']([^"']+)["']/g;
                    let match;
                    while ((match = linkRegex.exec(snapshot.html)) !== null) {
                        const href = match[1];
                        try {
                            const nextUrl = new URL(href, url);
                            if (nextUrl.hostname === domain && !visited.has(nextUrl.href)) {
                                queue.push({ url: nextUrl.href, depth: depth + 1 });
                            }
                        } catch (e) {
                            // Invalid URL
                        }
                    }
                }
            } catch (e) {
                console.error(`Failed to scan URL ${url}:`, e);
            }
        }
        return snapshots;
    }

    private async scanPage(url: string, filePath?: string): Promise<Snapshot> {
        const page = await this.browser!.newPage();
        console.log(`Scanning: ${url}`);
        // Wait for network idle to ensure JS execution/hydration
        await page.goto(url, { waitUntil: 'networkidle0' });

        const title = await page.title();
        // For local files, we MUST read from disk to get the "raw" source for patching.
        // Puppeteer's page.content() returns the *serialized* DOM, which might differ (e.g. injected scripts, closed tags).
        // For URLs, we have to use page.content() or fetch() raw.
        let html = '';
        if (filePath && fs.existsSync(filePath)) {
            html = fs.readFileSync(filePath, 'utf-8');
        } else {
            // For URLs, page.content() is the best we have for "rendered" state, 
            // but for "patching" we might want the raw response. 
            // However, we are patching the *source* usually. 
            // If scanning a URL, we can't patch the source easily unless we map it.
            // For Phase 1 URL scan, we'll just use page.content() and output a patch against that.
            html = await page.content();
        }

        // Extract DOM tree with styles
        const dom = await page.evaluate(() => {
            function getSelector(el: Element): string {
                if (el.id) return `#${el.id}`;
                let path = [];
                while (el.nodeType === Node.ELEMENT_NODE) {
                    let selector = el.nodeName.toLowerCase();
                    if (el.id) {
                        selector += '#' + el.id;
                        path.unshift(selector);
                        break;
                    } else {
                        let sib = el, nth = 1;
                        while (sib = sib.previousElementSibling as Element) {
                            if (sib.nodeName.toLowerCase() == selector) nth++;
                        }
                        if (nth != 1) selector += ":nth-of-type(" + nth + ")";
                    }
                    path.unshift(selector);
                    el = el.parentNode as Element;
                }
                return path.join(" > ");
            }

            // Inject tracker script to capture stack traces
            // In a real implementation, this would be a more complex script that hooks into React/Vue devtools
            // For MVP, we will try to capture a stack trace for the element creation if possible, 
            // or just rely on the fact that we can't easily get stack traces for *existing* DOM nodes without devtools.
            // HOWEVER, the requirement says "Collect stack traces for every DOM node with an issue".
            // This is hard for *already rendered* nodes.
            // Strategy: We will try to use a heuristic or just assume we can't get it for static HTML without source maps.
            // BUT, for React/Vue in dev mode, we can use the __REACT_DEVTOOLS_GLOBAL_HOOK__.

            // For this implementation, let's assume we can get some "debug info" if available.
            // We will add a placeholder for stack trace capture.

            function getComponentStack(node: Element): string | null {
                // Placeholder for React/Vue devtools integration
                // e.g. window.__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiber(node)
                return null;
            }

            function serializeNode(node: Element): any {
                const style = window.getComputedStyle(node);
                const rect = node.getBoundingClientRect();

                const attributes: Record<string, string> = {};
                for (let i = 0; i < node.attributes.length; i++) {
                    const attr = node.attributes[i];
                    attributes[attr.name] = attr.value;
                }

                const children: any[] = [];
                node.childNodes.forEach((child) => {
                    if (child.nodeType === Node.ELEMENT_NODE) {
                        children.push(serializeNode(child as Element));
                    }
                });

                const text = node.textContent || '';

                // Capture stack trace / debug info
                // For now, we'll simulate it or leave it empty. 
                // The SourceMapper will try to use it if present.
                const stack = getComponentStack(node);

                return {
                    tagName: node.tagName.toLowerCase(),
                    attributes,
                    children,
                    text: text.substring(0, 100),
                    selector: getSelector(node),
                    styles: {
                        color: style.color,
                        backgroundColor: style.backgroundColor,
                        fontSize: style.fontSize,
                        fontWeight: style.fontWeight,
                        display: style.display,
                        visibility: style.visibility,
                        opacity: style.opacity,
                        cursor: style.cursor,
                        backgroundImage: style.backgroundImage,
                    },
                    rect: {
                        width: rect.width,
                        height: rect.height,
                        top: rect.top,
                        left: rect.left,
                    },
                    componentStack: stack,
                    classList: Array.from(node.classList),
                    innerText: (node as HTMLElement).innerText || '',
                    id: node.id || '',
                    context: {
                        landmark: (function () {
                            let curr = node.parentElement;
                            while (curr) {
                                const tag = curr.tagName.toLowerCase();
                                if (['header', 'footer', 'nav', 'main', 'aside', 'section'].includes(tag)) return tag;
                                if (curr.getAttribute('role')) return curr.getAttribute('role');
                                curr = curr.parentElement;
                            }
                            return undefined;
                        })(),
                        parentComponent: (function () {
                            let curr = node.parentElement;
                            while (curr) {
                                // Heuristic for component names (often in class names or data attributes)
                                // e.g. class="HeroSection_container"
                                if (curr.className && typeof curr.className === 'string') {
                                    const match = curr.className.match(/([A-Z][a-zA-Z0-9]+)/);
                                    if (match) return match[1];
                                }
                                if (curr.id && /([A-Z][a-zA-Z0-9]+)/.test(curr.id)) return curr.id;
                                curr = curr.parentElement;
                            }
                            return undefined;
                        })(),
                        surroundingText: (function () {
                            // Get text from siblings or parent
                            let text = '';
                            if (node.previousElementSibling) text += ((node.previousElementSibling as HTMLElement).innerText || '') + ' ';
                            if (node.nextElementSibling) text += ((node.nextElementSibling as HTMLElement).innerText || '') + ' ';
                            if (!text && node.parentElement) text = (node.parentElement as HTMLElement).innerText || '';
                            return (text || '').substring(0, 200).trim();
                        })()
                    }
                };
            }

            return serializeNode(document.body);
        });

        await page.close();

        return {
            url,
            title,
            dom: dom as AXNode,
            html,
            filePath,
        };
    }
}
