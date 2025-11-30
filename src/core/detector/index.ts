import { Snapshot, AXNode, Issue } from '../../types';
// @ts-ignore
import { hex } from 'wcag-contrast';

export class Detector {
    private labelMap: Map<string, boolean> = new Map();
    private counts = {
        h1: 0,
        main: 0,
        nav: 0,
        header: 0,
        footer: 0,
        banner: 0,
        contentinfo: 0
    };

    detect(snapshot: Snapshot): Issue[] {
        const issues: Issue[] = [];
        this.labelMap.clear();
        this.counts = { h1: 0, main: 0, nav: 0, header: 0, footer: 0, banner: 0, contentinfo: 0 };

        // Pass 1: Build label map
        this.buildLabelMap(snapshot.dom);

        // Pass 2: Detect issues
        this.traverse(snapshot.dom, issues);

        // Post-traversal checks
        this.checkGlobalIssues(issues);

        return issues;
    }

    private buildLabelMap(node: AXNode) {
        if (node.tagName === 'label') {
            const forAttr = node.attributes['for'];
            if (forAttr) {
                this.labelMap.set(forAttr, true);
            }
        }
        if (node.children) {
            node.children.forEach(child => this.buildLabelMap(child));
        }
    }

    private isHidden(node: AXNode): boolean {
        if (node.attributes['aria-hidden'] === 'true') return true;
        if (node.attributes['hidden'] !== undefined) return true;
        if (node.styles) {
            if (node.styles.display === 'none') return true;
            if (node.styles.visibility === 'hidden') return true;
            if (node.styles.opacity === '0' && !this.isInteractive(node)) return true;
        }
        return false;
    }

    private isInteractive(node: AXNode): boolean {
        const tag = node.tagName;
        const role = node.attributes['role'];
        const tabindex = node.attributes['tabindex'];

        if (['button', 'a', 'input', 'select', 'textarea', 'details', 'summary'].includes(tag)) return true;
        if (role === 'button' || role === 'link' || role === 'menuitem' || role === 'tab') return true;
        if (tabindex && parseInt(tabindex) >= 0) return true;
        if (node.attributes['onclick'] || node.attributes['@click'] || node.attributes['v-on:click']) return true;

        return false;
    }

    private hasAccessibleName(node: AXNode): boolean {
        // 1. aria-label
        if (node.attributes['aria-label'] && node.attributes['aria-label'].trim() !== '') return true;

        // 2. aria-labelledby
        if (node.attributes['aria-labelledby'] && node.attributes['aria-labelledby'].trim() !== '') return true;

        // 3. title
        if (node.attributes['title'] && node.attributes['title'].trim() !== '') return true;

        // 4. text content (innerText or text)
        if (node.innerText && node.innerText.trim() !== '') return true;
        if (node.text && node.text.trim() !== '') return true;

        // 5. alt text (for images/inputs)
        if ((node.tagName === 'img' || (node.tagName === 'input' && node.attributes['type'] === 'image')) &&
            node.attributes['alt'] && node.attributes['alt'].trim() !== '') return true;

        // 6. Recursively check children for text/labels (simplified)
        if (node.children && node.children.some(child => this.hasAccessibleName(child))) return true;

        return false;
    }

    private traverse(node: AXNode, issues: Issue[], ancestors: string[] = []) {
        // 1. Skip hidden nodes
        if (this.isHidden(node)) return;

        // 2. Filter framework internals
        if (node.classList && node.classList.some(c => c.startsWith('__next') || c.includes('hydrate') || c.includes('wrapper'))) {
            // Skip checking this node but maybe traverse children? 
            // Usually these are just wrappers, so we should traverse children.
            // But if it's a "hidden" wrapper, isHidden would catch it.
            // Let's just continue traversal but skip rules for this specific node if needed.
            // For now, let's just proceed.
        }

        // Update counters
        if (node.tagName === 'h1') this.counts.h1++;
        if (node.tagName === 'main' || node.attributes['role'] === 'main') this.counts.main++;
        if (node.tagName === 'nav' || node.attributes['role'] === 'navigation') this.counts.nav++;
        if (node.tagName === 'header' || node.attributes['role'] === 'banner') {
            if (!ancestors.includes('article') && !ancestors.includes('section')) this.counts.banner++;
            this.counts.header++;
        }
        if (node.tagName === 'footer' || node.attributes['role'] === 'contentinfo') {
            if (!ancestors.includes('article') && !ancestors.includes('section')) this.counts.contentinfo++;
            this.counts.footer++;
        }

        const signature = this.getSignature(node, ancestors);

        // --- RULES ---

        // 1. Missing Alt Text (Images)
        if (node.tagName === 'img') {
            const alt = node.attributes['alt'];
            const role = node.attributes['role'];
            if (alt === undefined || alt === null || (alt.trim() === '' && role !== 'presentation' && role !== 'none')) {
                issues.push(this.createIssue('missing-alt', 'serious', node, 'Image is missing alt text', signature));
            }
        }

        // 2. Background Image Missing Description
        if (node.styles?.backgroundImage &&
            node.styles.backgroundImage !== 'none' &&
            !node.attributes['aria-label'] &&
            !node.attributes['aria-labelledby'] &&
            node.attributes['role'] !== 'presentation' &&
            node.attributes['role'] !== 'none' &&
            !this.hasAccessibleName(node)) {
            // Only flag if it seems meaningful (no text content)
            if (!node.innerText || node.innerText.trim() === '') {
                issues.push(this.createIssue('missing-alt-bg', 'moderate', node, 'Element with background image missing description', signature));
            }
        }

        // 3. Missing Input Label
        if (node.tagName === 'input' && !['hidden', 'submit', 'button', 'image', 'reset'].includes(node.attributes['type'])) {
            const hasAriaLabel = node.attributes['aria-label'];
            const hasAriaLabelledBy = node.attributes['aria-labelledby'];
            const hasForLabel = node.attributes['id'] && this.labelMap.has(node.attributes['id']);
            const hasTitle = node.attributes['title'];
            const hasPlaceholder = node.attributes['placeholder']; // Placeholder is not a replacement but better than nothing for now? No, WCAG says it's not enough.
            // Check ancestor label
            const hasAncestorLabel = ancestors.includes('label'); // Simplified check, ideally check if parent is label

            if (!hasAriaLabel && !hasAriaLabelledBy && !hasForLabel && !hasTitle && !hasAncestorLabel) {
                issues.push(this.createIssue('missing-label', 'critical', node, 'Input is missing a label', signature));
            }
        }

        // 4. Interactive Role / Tabindex / Semantics
        if ((node.tagName === 'div' || node.tagName === 'span') && (node.styles?.cursor === 'pointer' || node.classList?.some(c => c.includes('btn') || c.includes('button') || c.includes('clickable')))) {
            const role = node.attributes['role'];
            const tabindex = node.attributes['tabindex'];
            const hasClick = node.attributes['onclick'] || node.attributes['@click'] || node.attributes['v-on:click'];

            if (!role && (!tabindex || parseInt(tabindex) < 0)) {
                issues.push(this.createIssue('interactive-role', 'moderate', node, 'Interactive element missing role and tabindex', signature));
            }

            // If it has role button but no tabindex
            if (role === 'button' && (!tabindex || parseInt(tabindex) < 0)) {
                issues.push(this.createIssue('interactive-role', 'moderate', node, 'Button role missing tabindex', signature));
            }
        }

        // 5. Semantic Div/Span as Button (Explicit)
        if ((node.tagName === 'div' || node.tagName === 'span' || node.tagName === 'a') &&
            (node.attributes['role'] === 'button' || node.attributes['onclick'] || node.attributes['@click'])) {

            if (node.tagName === 'a' && !node.attributes['href']) {
                issues.push(this.createIssue('semantic-link-button', 'serious', node, 'Anchor used as button (missing href)', signature));
            } else if (node.tagName !== 'a') {
                issues.push(this.createIssue('semantic-div-button', 'serious', node, 'Element used as button. Should be <button>', signature));
            }
        }

        // 6. Color Contrast
        if (node.text && node.text.trim().length > 0 && node.styles) {
            const fg = this.parseColor(node.styles.color);
            const bg = this.parseColor(node.styles.backgroundColor);
            if (fg && bg) {
                try {
                    const ratio = hex(fg, bg);
                    if (ratio < 4.5) {
                        issues.push(this.createIssue('color-contrast', 'minor', node, `Low color contrast: ${ratio.toFixed(2)}`, signature, { fg, bg, ratio }));
                    }
                } catch (e) { }
            }
        }

        // 7. SVG Accessibility
        if (node.tagName === 'svg') {
            const isHidden = node.attributes['aria-hidden'] === 'true';
            const hasRole = node.attributes['role'] === 'img';
            const hasLabel = this.hasAccessibleName(node);

            if (!isHidden && (!hasRole || !hasLabel)) {
                issues.push(this.createIssue('svg-accessibility', 'moderate', node, 'SVG should be hidden or have role="img" and label', signature));
            }
        }

        // 8. Missing Accessible Name (Interactive)
        if (this.isInteractive(node) && !this.hasAccessibleName(node)) {
            // Exclude if it's a layout wrapper that happens to be clickable but has children with names?
            // But isInteractive checks for button/link/etc.
            issues.push(this.createIssue('missing-accessible-name', 'critical', node, 'Interactive element missing accessible name', signature));
        }

        // 9. Empty Buttons
        if (node.tagName === 'button' && !this.hasAccessibleName(node)) {
            // This is covered by rule 8, but explicit check is good too.
            // Duplicate? Let's rely on rule 8.
        }

        // 10. Links without href
        if (node.tagName === 'a' && !node.attributes['href'] && !node.attributes['role']) {
            // Covered by rule 5 partially, but let's be specific
            // If it has no role, it's just a placeholder link?
            issues.push(this.createIssue('link-no-href', 'serious', node, 'Link missing href', signature));
        }

        // 11. Heading Structure (Skipped Levels)
        if (/^h[1-6]$/.test(node.tagName)) {
            const level = parseInt(node.tagName[1]);
            // We need to track previous heading level in traversal... 
            // This is hard with recursion without passing state.
            // For now, let's skip complex hierarchy check in this pass.
        }

        // 12. Missing Landmarks (Heuristic) - Same as before but improved
        this.checkLandmarks(node, ancestors, issues, signature);

        // Recurse
        if (node.children) {
            const newAncestors = [...ancestors, node.tagName];
            node.children.forEach(child => this.traverse(child, issues, newAncestors));
        }
    }

    private checkLandmarks(node: AXNode, ancestors: string[], issues: Issue[], signature: any) {
        if (node.tagName === 'div') {
            const id = (node.attributes['id'] || '').toLowerCase();
            const cls = (node.classList || []).join(' ').toLowerCase();

            if ((id.includes('header') || cls.includes('header')) && !node.attributes['role'] && !ancestors.includes('header')) {
                issues.push(this.createIssue('missing-landmark', 'moderate', node, 'Potential header detected', signature, { landmark: 'header' }));
            }
            if ((id.includes('footer') || cls.includes('footer')) && !node.attributes['role'] && !ancestors.includes('footer')) {
                issues.push(this.createIssue('missing-landmark', 'moderate', node, 'Potential footer detected', signature, { landmark: 'footer' }));
            }
            if ((id.includes('nav') || cls.includes('nav')) && !node.attributes['role'] && !ancestors.includes('nav')) {
                issues.push(this.createIssue('missing-landmark', 'moderate', node, 'Potential navigation detected', signature, { landmark: 'nav' }));
            }
            if ((id.includes('main') || cls.includes('main')) && !node.attributes['role'] && !ancestors.includes('main')) {
                issues.push(this.createIssue('missing-landmark', 'moderate', node, 'Potential main content detected', signature, { landmark: 'main' }));
            }
        }
    }

    private checkGlobalIssues(issues: Issue[]) {
        if (this.counts.h1 === 0) {
            issues.push({
                issueId: 'missing-h1',
                issueType: 'heading-structure',
                severity: 'serious',
                selector: 'html',
                message: 'Page is missing a level 1 heading (<h1>)',
                context: {}
            });
        }
        if (this.counts.h1 > 1) {
            issues.push({
                issueId: 'multiple-h1',
                issueType: 'heading-structure',
                severity: 'moderate',
                selector: 'html',
                message: 'Page has multiple level 1 headings',
                context: {}
            });
        }
        if (this.counts.main === 0) {
            issues.push({
                issueId: 'missing-main',
                issueType: 'landmark-structure',
                severity: 'moderate',
                selector: 'html',
                message: 'Page is missing a main landmark (<main> or role="main")',
                context: {}
            });
        }
    }

    private createIssue(type: string, severity: 'critical' | 'serious' | 'moderate' | 'minor', node: AXNode, message: string, signature: any, extraContext: any = {}): Issue {
        return {
            issueId: `${type}-${Math.random().toString(36).substr(2, 9)}`,
            issueType: type,
            severity,
            selector: node.selector || '',
            message,
            context: {
                text: node.text,
                attributes: node.attributes,
                ...extraContext
            },
            signature
        };
    }

    private getSignature(node: AXNode, ancestors: string[]): import('../../types').Signature {
        return {
            tag: node.tagName,
            text: node.text || node.innerText,
            classes: node.classList,
            attributes: node.attributes,
            structure: [...ancestors],
            context: node.context,
            isInteractive: this.isInteractive(node),
            hasText: !!(node.text || node.innerText),
            hasAria: !!(node.attributes['aria-label'] || node.attributes['aria-labelledby']),
            isFocusable: !!node.attributes['tabindex'] || ['a', 'button', 'input', 'select', 'textarea'].includes(node.tagName)
        };
    }

    private parseColor(colorStr: string): string | null {
        if (!colorStr) return null;

        // Hex
        if (colorStr.startsWith('#')) {
            if (colorStr.length === 4) {
                return '#' + colorStr[1] + colorStr[1] + colorStr[2] + colorStr[2] + colorStr[3] + colorStr[3];
            }
            return colorStr;
        }

        // RGB
        const rgbMatch = colorStr.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (rgbMatch) {
            return this.rgbToHex(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]));
        }

        // RGBA
        const rgbaMatch = colorStr.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
        if (rgbaMatch) {
            if (parseFloat(rgbaMatch[4]) === 1) {
                return this.rgbToHex(parseInt(rgbaMatch[1]), parseInt(rgbaMatch[2]), parseInt(rgbaMatch[3]));
            }
            // If alpha < 1, we can't easily determine contrast without background blending.
            // For now, ignore or assume white background? Ignore.
            return null;
        }

        // Named colors (basic set)
        const namedColors: Record<string, string> = {
            red: '#ff0000', green: '#008000', blue: '#0000ff', white: '#ffffff', black: '#000000',
            gray: '#808080', grey: '#808080', yellow: '#ffff00', purple: '#800080', orange: '#ffa500'
        };
        if (namedColors[colorStr.toLowerCase()]) return namedColors[colorStr.toLowerCase()];

        return null;
    }

    private rgbToHex(r: number, g: number, b: number): string {
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
}
