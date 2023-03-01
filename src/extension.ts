// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { exec, execSync } from 'child_process';
import * as git from 'simple-git';
import * as branchInfo from './branchinfo';
import { randomUUID } from 'crypto';
import { ResetMode } from 'simple-git';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	var extension = new ActiveGitBackup(context);
	extension.showOutputMessage();

	vscode.workspace.onDidChangeConfiguration(() => {
		let disposeStatus = extension.showStatusMessage('Run On Save: Reloading config.');
		extension.loadConfig();
		disposeStatus.dispose();
	});

	vscode.commands.registerCommand('extension.active-git-backup.enableExtension', () => {
		extension.isEnabled = true;
	});

	vscode.commands.registerCommand('extension.active-git-backup.disableExtension', () => {
		extension.isEnabled = false;
	});

	// vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
	// 	extension.getCurrentBranchName().then(
	// 		branchName => {
	// 			extension.shouldAutoBackup(branchName).then(
	// 				shouldBackup => {
	// 					if (shouldBackup) {
	// 						extension.backup(branchName);
	// 					}
	// 				}
	// 			);
	// 		}
	// 	);
	// });

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "active-git-backup" is now active!');

	context.subscriptions.push(
		vscode.commands.registerCommand('active-git-backup.createBackupBranch',
			() => extension.createBackupBranch()
		));

	context.subscriptions.push(
		vscode.commands.registerCommand('active-git-backup.backup',
			async () => {
				// The code you place here will be executed every time your command is executed
				// Display a message box to the user
				vscode.window.showInformationMessage('Hello World from active-git-backup!');
				extension.backup();
			}
		));

	context.subscriptions.push(
		vscode.commands.registerCommand('active-git-backup.loadBackup',
			() => {
				// The code you place here will be executed every time your command is executed
				// Display a message box to the user
				vscode.window.showInformationMessage('Hello World from active-git-backup!');
			}
		));
}

// This method is called when your extension is deactivated
export function deactivate() { }

interface IConfig {
	branchInfoPath: string;
	// defaultBackupEveryBranch: boolean;
	defaultAutoBackupBranches: boolean;
}

class ActiveGitBackup {
	private _outputChannel: vscode.OutputChannel;
	private _context: vscode.ExtensionContext;
	private config: vscode.WorkspaceConfiguration;
	private _config: IConfig;

	private _git: git.SimpleGit;
	private _branchInfo: branchInfo.BranchInfoManager;

	constructor(context: vscode.ExtensionContext) {
		this._context = context;
		this._outputChannel = vscode.window.createOutputChannel('Active Git Backup');
		this.config = vscode.workspace.getConfiguration('active-git-backup');
		this._config = <IConfig><any>this.config;
		console.log(this._config);

		if (vscode.workspace.workspaceFolders !== undefined) {
			console.log(vscode.workspace.workspaceFolders[0].uri.fsPath);
			this._git = git.simpleGit({ baseDir: vscode.workspace.workspaceFolders[0].uri.fsPath });
			this._branchInfo = new branchInfo.BranchInfoManager(
				vscode.workspace.workspaceFolders[0].uri,
				this._config.branchInfoPath
			);
		} else {
			throw new Error("???????");
		}
	}

	public get isEnabled(): boolean {
		return !!this._context.globalState.get('isEnabled', true);
	}
	public set isEnabled(value: boolean) {
		this._context.globalState.update('isEnabled', value);
		this.showOutputMessage();
	}

	public loadConfig(): void {
		this.config = vscode.workspace.getConfiguration('active-git-backup');
		this._config = <IConfig><any>this.config;
	}

	private updateConfig(): void {
		// TODO is this needed??
	}

	/**
	 * Show message in output channel
	 */
	public showOutputMessage(message?: string): void {
		message = message || `Run On Save ${this.isEnabled ? 'enabled' : 'disabled'}.`;
		this._outputChannel.appendLine(message);
	}

	/**
	 * Show message in status bar and output channel.
	 * Return a disposable to remove status bar message.
	 */
	public showStatusMessage(message: string): vscode.Disposable {
		this.showOutputMessage(message);
		return vscode.window.setStatusBarMessage(message);
	}

	public async getCurrentBranchName(branchName?: string): Promise<string> {
		console.log("Getting current branch name");
		if (branchName !== undefined) {
			return branchName;
		}
		return this._git.branch().then(value => {
			console.log("git current branch is: " + value.current);
			return value.current;
		});
	}

	public async shouldAutoBackup(branchName?: string): Promise<boolean> {
		if (!this.isEnabled) {
			return false;
		}
	
		return this.getCurrentBranchName(branchName).then(currentBranchName => 
			this._branchInfo.get(this._config.branchInfoPath, currentBranchName).then(v => {
				if (v === undefined) {
					return false;
				}
				return v.autoBackup;
			})
		);
	}

	public async createBackupBranch(branchName?: string, backupBranchName?: string): Promise<string | undefined> {
		if (!this.isEnabled) {
			return;
		}

		let branchInfoMap = await this._branchInfo.getMap(this._config.branchInfoPath);

		console.log(branchInfoMap);

		let backupBranchNames = new Set(Array.from(branchInfoMap.values()).map(info => info.backupBranchName));
		if (backupBranchName !== undefined && backupBranchNames.has(backupBranchName)) {
			return;
		}

		console.log("Creating backup branch");

		let currentBranchName: string = await this.getCurrentBranchName(branchName);
		if (branchInfoMap.has(currentBranchName)) {
			console.log("Branch " + currentBranchName + " already has a backup branch, aborting");
			return;
		}
		backupBranchName = (backupBranchName !== undefined) ? backupBranchName : "agb-backup-" + currentBranchName;
		// this._git.checkout(["-b", backupBranchName]);
		this._git.branch([backupBranchName, currentBranchName]);
		this._branchInfo.update(this._config.branchInfoPath, currentBranchName, {
			autoBackup: this._config.defaultAutoBackupBranches,
			backupBranchName: backupBranchName,
		});
		return backupBranchName;
	}

	public async backup(branchName?: string) {
		if (!this.isEnabled) {
			return;
		}
		let currentBranchName = await this.getCurrentBranchName(branchName);
		let branchInfo = await this._branchInfo.get(this._config.branchInfoPath, currentBranchName);
		if (branchInfo === undefined) {
			return;
		}
		let backupBranchName: string = branchInfo.backupBranchName;

		this._git.reset().then(s => {
			console.log(s);
			return this._git.checkout(backupBranchName);
		}).then(async successString => {
			console.log(successString);
			const r1 = await this._git.add(".");
			const r2 = await this._git.commit("backup commit: " + randomUUID());
			const r3 = await this._git.push(["origin", currentBranchName, "--force"]);
			const r4 = await this._git.reset(["--mixed", "HEAD~1"]);
			return await this._git.checkout(currentBranchName);
		}, failureString => {
			console.log("Git Checkout Backup branch failed, out of sync");
		});
	}

	// public async canLoadBackup(): Promise<boolean> {
	// 	if (!this.isEnabled) {
	// 		return false;
	// 	}
	// 	return true;
	// }

	public async loadBackup(branchName?: string): Promise<boolean> {
		if (!this.isEnabled) {
			return false;
		}
		if (vscode.workspace.textDocuments.filter(document => document.isDirty).length !== 0) {
			return false;
		}

		let currentBranchName = await this.getCurrentBranchName(branchName);
		let branchInfo = await this._branchInfo.get(this._config.branchInfoPath, currentBranchName);
		if (branchInfo === undefined) {
			return false;
		}
		let backupBranchName: string = branchInfo.backupBranchName;
		this._git.checkout(backupBranchName).then(
			async successString => {
				const r1 = await this._git.fetch();
				const r2 = await this._git.reset(["--hard", "origin/" + backupBranchName]);
				const r3 = await this._git.reset(["--mixed", "HEAD~1"]);
				return await this._git.checkout(currentBranchName);
			},
			onrejected => {
				// TODO: stash and then do the standard
				// this._git.stash();
			}
		);

		return true;
	}
}