import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class ConfigManager {
    private configPath: string;
    private config: Record<string, any> = {};

    constructor() {
        this.configPath = path.join(os.homedir(), '.a11y-forgerc');
        this.load();
    }

    private load() {
        if (fs.existsSync(this.configPath)) {
            try {
                const content = fs.readFileSync(this.configPath, 'utf-8');
                this.config = JSON.parse(content);
            } catch (e) {
                // Ignore invalid config
                this.config = {};
            }
        }
    }

    private save() {
        fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    }

    get(key: string): any {
        return this.config[key];
    }

    set(key: string, value: any) {
        this.config[key] = value;
        this.save();
    }

    delete(key: string) {
        delete this.config[key];
        this.save();
    }
}
