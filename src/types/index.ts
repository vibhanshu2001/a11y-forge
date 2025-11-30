export interface ComputedStyles {
    color: string;
    backgroundColor: string;
    fontSize: string;
    fontWeight: string;
    display: string;
    visibility: string;
    opacity: string;
    cursor?: string;
    backgroundImage?: string;
}

export interface Signature {
    tag: string;
    text?: string;
    classes?: string[];
    attributes?: Record<string, string>;
    structure?: string[]; // e.g. ['div', 'header', 'body']
    context?: {
        landmark?: string;
        parentComponent?: string;
        surroundingText?: string;
    };
    // Enhanced Signature Fields
    boundingBox?: { width: number, height: number, top: number, left: number };
    isInteractive?: boolean;
    hasText?: boolean;
    hasAria?: boolean;
    isFocusable?: boolean;
    computedRole?: string;
    computedName?: string;
    parentRole?: string;
    neighborText?: string;
}

export interface AXNode {
    tagName: string;
    attributes: Record<string, string>;
    children?: AXNode[];
    text?: string;
    innerText?: string;
    styles?: ComputedStyles;
    selector?: string;
    rect?: {
        width: number;
        height: number;
        top: number;
        left: number;
    };
    componentStack?: string | null;
    classList?: string[];
    id?: string;
    context?: {
        landmark?: string;
        parentComponent?: string;
        surroundingText?: string;
    };
}

export interface Snapshot {
    url: string;
    title: string;
    dom: AXNode;
    html: string; // Full HTML string for patching
    filePath?: string; // Original local file path if applicable
}

export interface Issue {
    issueId: string;
    issueType: string;
    severity: 'critical' | 'serious' | 'moderate' | 'minor';
    selector: string;
    message: string;
    context?: {
        text?: string;
        attributes?: Record<string, string>;
        // New Context Fields
        landmark?: string;
        parentComponent?: string;
        surroundingText?: string;
    };
    metadata?: any;
    signature?: Signature;
}

export interface Fix {
    fixType: 'add-attribute' | 'replace-attribute' | 'add-element' | 'convert-tag';
    selector: string;
    payload: {
        attribute?: string;
        value?: string;
        html?: string;
        tagName?: string; // For convert-tag
        attributes?: Record<string, string>; // For convert-tag
    };
    metadata?: {
        context?: any;
        signature?: Signature;
        reasoning?: string; // AI reasoning for the change
        sourceLocation?: {
            source: string;
            line: number;
            column: number;
            closingLocation?: { line: number, column: number };
        };
    };
}
