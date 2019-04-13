import * as childProcess from "child_process";
import * as fs from "fs";
import { Extension, ExtensionContext, OutputChannel, window } from "vscode";
import { HttpClient } from "./httpClient";
import * as util from "./util/common";
import { ExtensionDownloader } from "./util/ExtensionDownloader";
import { Logger } from "./util/logger";

export class MarkdocsServer {
    private spawnProcess: childProcess.ChildProcess;
    private started: boolean = false;
    private context: ExtensionContext;

    constructor(context: ExtensionContext) {
        this.context = context;
    }

    public ensureRuntimeDependencies(extension: Extension<any>, channel: OutputChannel, logger: Logger): Promise<boolean> {
        return util.installFileExists(util.InstallFileType.Lock)
            .then((exists) => {
                if (!exists) {
                    const downloader = new ExtensionDownloader(channel, logger, extension.packageJSON);
                    return downloader.installRuntimeDependencies();
                } else {
                    return true;
                }
            });
    }

    public async startMarkdocsServerAsync(logger: Logger): Promise<void> {
        const hasStarted = await this.hasAlreadyStartAsync();
        if (hasStarted) {
            return;
        }

        const serverPath = this.getServerPath();
        if (!serverPath) {
            window.showErrorMessage(`[DocsPreview Error]: DocsPreview service can't be found.`);
            logger.appendLine(`[DocsPreview Error]: DocsPreview service can't be found.`)
            return;
        }

        try {
            if (serverPath.indexOf("DocsPreviewService.dll") !== -1) {
                this.spawnProcess = childProcess.spawn("dotnet", [serverPath]);
            } else {
                this.spawnProcess = childProcess.spawn(serverPath);
            }
        } catch (err) {
            window.showErrorMessage(`[DocsPreview Error]: ${err}`);
            logger.appendLine(`[DocsPreview Error]: ${err}`);
            return;
        }

        if (!this.spawnProcess.pid) {
            window.showErrorMessage(`[DocsPreview Error] Error occurs while spawning markdocs local server.`);
            logger.appendLine(`[DocsPreview Error] Error occurs while spawning markdocs local server.`);
            return;
        }

        this.spawnProcess.stdout.on("data", (data) => {
            this.started = false;
        });

        this.spawnProcess.stderr.on("data", (data) => {
            window.showErrorMessage(`[DocsPreview Error]: ${data.toString()}`);
            logger.appendLine(`[DocsPreview Error]: ${data.toString()}`);
        });

        await this.ensureMarkdocsServerWorkAsync();
    }

    public async stopMarkdocsServerAsync() {
        const hasStarted = await this.hasAlreadyStartAsync();
        if (hasStarted) {
            this.spawnProcess.kill();
        }
    }

    private async ensureMarkdocsServerWorkAsync(): Promise<void> {
        while (true) {
            try {
                await HttpClient.pingAsync();
                return;
            } catch (Error) {
                await this.sleepAsync(100);
            }
        }
    }

    private async hasAlreadyStartAsync(): Promise<boolean> {
        try {
            await HttpClient.pingAsync();
            return true;
        } catch (Error) {
            return false;
        }
    }

    private async sleepAsync(ms: number) {
        return Promise.resolve((resolve) => {
            setTimeout(() => {
                resolve();
            }, ms);
        });
    }

    private getServerPath() {
        const serverPaths = [
            ".markdocs/DocsPreviewService", // for macOS/Linux
            ".markdocs/DocsPreviewService.exe", // for Windows
            ".markdocs/DocsPreviewService.dll", // for .NET Core
        ];

        for (let p of serverPaths) {
            p = this.context.asAbsolutePath(p);
            if (fs.existsSync(p)) {
                return p;
            }
        }
    }
}
