import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

export class StaticServer {
    private server: http.Server | null = null;
    private root: string = '';

    constructor(root: string) {
        this.root = path.resolve(root);
    }

    async start(): Promise<string> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                // Basic security: prevent directory traversal
                const safePath = path.normalize(req.url || '/').replace(/^(\.\.[\/\\])+/, '');
                let filePath = path.join(this.root, safePath);

                // Default to index.html for directories
                if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
                    filePath = path.join(filePath, 'index.html');
                }

                if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                    const ext = path.extname(filePath).toLowerCase();
                    const mimeTypes: Record<string, string> = {
                        '.html': 'text/html',
                        '.js': 'text/javascript',
                        '.css': 'text/css',
                        '.json': 'application/json',
                        '.png': 'image/png',
                        '.jpg': 'image/jpeg',
                        '.gif': 'image/gif',
                        '.svg': 'image/svg+xml',
                        '.ico': 'image/x-icon',
                    };

                    const contentType = mimeTypes[ext] || 'application/octet-stream';
                    res.writeHead(200, { 'Content-Type': contentType });
                    fs.createReadStream(filePath).pipe(res);
                } else {
                    res.writeHead(404);
                    res.end('Not found');
                }
            });

            // Listen on random port
            this.server.listen(0, () => {
                const address = this.server?.address();
                if (address && typeof address !== 'string') {
                    resolve(`http://localhost:${address.port}`);
                } else {
                    reject(new Error('Failed to get server address'));
                }
            });

            this.server.on('error', (err) => reject(err));
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.server) {
                this.server.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
                this.server = null;
            } else {
                resolve();
            }
        });
    }
}
