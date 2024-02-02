import { TextDecoder, TextEncoder } from 'util';
import * as vscode from 'vscode';

export interface BranchInfo {
    autoBackup: boolean,
    backupBranchName: string,
}


export class BranchInfoManager {
    private workspaceUri: vscode.Uri;
    private branchInfoMap: Map<string, BranchInfo> = new Map();

    private encoder = new TextEncoder();
    private decoder = new TextDecoder();

    constructor(workspaceUri: vscode.Uri) {
        this.workspaceUri = workspaceUri;
    }

    private async readBranchInfoFile(branchInfoPath: string) {
        let branchInfoUri = this.workspaceUri.with({path: this.workspaceUri.path + "/" + branchInfoPath});
        return vscode.workspace.fs.readFile(branchInfoUri).then(content => {
            this.branchInfoMap = new Map();
            const jsonObject = JSON.parse(this.decoder.decode(content));
            for (const [key, value] of Object.entries(jsonObject)) {
                this.branchInfoMap.set(key, value as BranchInfo);
            }
        }, onrejected => {
            // Do nothing, since we'll then create a new file
            this.branchInfoMap = new Map();
        });
    }

    private async updateBranchInfoFile(branchInfoPath: string) {
        let branchInfoUri = this.workspaceUri.with({path: this.workspaceUri.path + "/" + branchInfoPath});
        return vscode.workspace.fs.writeFile(branchInfoUri, 
            this.encoder.encode(
                JSON.stringify(Object.fromEntries(this.branchInfoMap), null, 4)
            )
        );
    }

    public async getMap(branchInfoPath: string): Promise<Map<string, BranchInfo>> {
        return this.readBranchInfoFile(branchInfoPath).then(() => this.branchInfoMap);
    }

    public async get(branchInfoPath: string, branchName: string): Promise<BranchInfo | undefined> {
        return this.getMap(branchInfoPath).then(m => m.get(branchName));
    }

    public async has(branchInfoPath: string, branchName: string): Promise<boolean> {
        return this.get(branchInfoPath, branchName).then(info => info !== undefined);
    }

    public async update(branchInfoPath: string, branchName: string, branchInfo: BranchInfo) {
        // this makes sure the branch info map is up to date
        await this.getMap(branchInfoPath);
        this.branchInfoMap.set(branchName, branchInfo);
        return this.updateBranchInfoFile(branchInfoPath);
    }

    public async delete(branchInfoPath: string, branchName: string) {
        // this makes sure the branch info map is up to date
        await this.getMap(branchInfoPath);
        this.branchInfoMap.delete(branchName);
        return this.updateBranchInfoFile(branchInfoPath);
    }
    
    public async updateAutoBackup(branchInfoPath: string, defaultAutoBackupBranches:boolean) {
        await this.getMap(branchInfoPath);
        this.branchInfoMap.forEach( (_branchInfo, branchName) => {
            _branchInfo.autoBackup = defaultAutoBackupBranches;
        });
        return this.updateBranchInfoFile(branchInfoPath);
    }
}