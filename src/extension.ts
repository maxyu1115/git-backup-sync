// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
// import * as path from 'path';
import * as git from 'simple-git';
import * as branchInfo from './branchinfo';
import { randomUUID } from 'crypto';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	var extension = new ActiveGitBackup(context);

	vscode.workspace.onDidChangeConfiguration(() => {
		extension.loadConfig();
	});

	vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
		// TODO: do we want to ignore document if it is the agbinfo file?
		let branchName = await extension.getCurrentBranchName();
		let shouldBackup = await extension.shouldAutoBackup(branchName);
		if (shouldBackup) {
			await extension.backup(branchName);
		}
	});

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "active-git-backup" is now active!');

	context.subscriptions.push(
		vscode.commands.registerCommand('active-git-backup.createBackupBranch',
			() => extension.createBackupBranch()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('active-git-backup.retireBackupBranch',
			() => extension.retireBackupBranch()
		)
	);
	
	context.subscriptions.push(
		vscode.commands.registerCommand('active-git-backup.syncBackupBranch',
			() => extension.syncBackupBranch()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('active-git-backup.backup',
			() => extension.backup()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('active-git-backup.loadBackup',
			() => extension.loadBackup()
		)
	);
}

// This method is called when your extension is deactivated
export function deactivate() { }

interface IConfig {
	branchInfoPath: string;
	defaultBackupUpstreamName: string;
	defaultAutoBackupBranches: boolean;
	shouldCommitBranchInfoFile: boolean;
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
				vscode.workspace.workspaceFolders[0].uri
			);
		} else {
			throw new Error("Active Git Backup: Failed to activate extension, this can only be ran from within a workspace.");
		}
	}

	public get isEnabled(): boolean {
		return !!this._context.globalState.get('isEnabled', true);
	}
	public set isEnabled(value: boolean) {
		this._context.globalState.update('isEnabled', value);
	}

	public loadConfig(): void {
		this.config = vscode.workspace.getConfiguration('active-git-backup');
		this._config = <IConfig><any>this.config;
	}

	/**
	 * Show message in output channel
	 */
	public showOutputMessage(message?: string): void {
		console.log(message);
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
		let currentBranchName: string = await this.getCurrentBranchName(branchName);
		console.log(`Creating Backup Branch for "${currentBranchName}"`);

		let branchInfoMap = await this._branchInfo.getMap(this._config.branchInfoPath);

		let backupBranchNames = new Set(Array.from(branchInfoMap.values()).map(info => info.backupBranchName));
		backupBranchName = (backupBranchName !== undefined) ? backupBranchName : "agb-backup-" + currentBranchName;
		if (backupBranchNames.has(backupBranchName)) {
			this.showStatusMessage(`Create Backup Branch failed: intended backup branch name "${backupBranchName}" already exists`);
			return;
		}

		if (branchInfoMap.has(currentBranchName)) {
			this.showStatusMessage(`Create Backup Branch failed: "${currentBranchName}" already has a backup branch, aborting`);
			return;
		}
		await this._branchInfo.update(this._config.branchInfoPath, currentBranchName, {
			autoBackup: this._config.defaultAutoBackupBranches,
			backupBranchName: backupBranchName,
		});
		// unstage current changes
		console.log(await this._git.reset());
		if (this._config.shouldCommitBranchInfoFile) {
			console.log(await this._git.add(this._config.branchInfoPath));
			console.log(await this._git.commit(`active-git-backup: create backup branch for [${currentBranchName}]`));
		}
		console.log(await this._git.branch([backupBranchName, currentBranchName]));
		return backupBranchName;
	}

	public async retireBackupBranch(branchName?: string): Promise<void> {
		if (!this.isEnabled) {
			return;
		}

		let currentBranchName: string = await this.getCurrentBranchName(branchName);
		console.log(`Retiring Backup Branch for "${currentBranchName}"`);

		let branchInfoMap = await this._branchInfo.getMap(this._config.branchInfoPath);
		let backupBranchInfo = branchInfoMap.get(currentBranchName);

		if (backupBranchInfo === undefined) {
			this.showStatusMessage(`Retire Backup Branch Aborted: "${currentBranchName}" doesn't have a backup branch, aborting`);
			return;
		}

		console.log(await this._branchInfo.delete(this._config.branchInfoPath, currentBranchName));
		console.log(await this._git.deleteLocalBranch(backupBranchInfo.backupBranchName));

		// TODO: undo the "active-git-backup: create backup branch" commit?
	}

	public async syncBackupBranch(branchName?: string): Promise<string | undefined> {
		if (!this.isEnabled) {
			return;
		}

		let currentBranchName: string = await this.getCurrentBranchName(branchName);
		console.log(`Syncing Backup Branch for "${currentBranchName}"`);

		let branchInfoMap = await this._branchInfo.getMap(this._config.branchInfoPath);
		let backupBranchInfo = branchInfoMap.get(currentBranchName);

		if (backupBranchInfo === undefined) {
			this.showStatusMessage(`Sync Backup Branch Aborted: "${currentBranchName}" doesn't have a backup branch, aborting`);
			return;
		}

		// by recreating the local backup branch, we make sure the local backup branch is in sync to the local branch
		console.log(await this._git.deleteLocalBranch(backupBranchInfo.backupBranchName));
		console.log(await this._git.branch([backupBranchInfo.backupBranchName, currentBranchName]));
	}

	public async backup(branchName?: string): Promise<void> {
		if (!this.isEnabled) {
			return;
		}
		let currentBranchName = await this.getCurrentBranchName(branchName);
		console.log(`Backing up Current Branch "${currentBranchName}"`);

		let branchInfo = await this._branchInfo.get(this._config.branchInfoPath, currentBranchName);
		if (branchInfo === undefined) {
			this.showStatusMessage("Backup failed: no backup branch found. Please create backup branch first");
			return;
		}
		let backupBranchName: string = branchInfo.backupBranchName;

		// unstages current changes
		console.log(await this._git.reset());
		try {
			console.log(await this._git.checkout(backupBranchName));
		} catch(exception) {
			console.log(exception);
			// TODO: might want to add an auto refresh backup branch
			this.showStatusMessage("Backup failed during checkout backup branch, backup branch is likely out of sync with your branch "
				 + currentBranchName + ". Did you refresh your backup branch after last commit, or forgot to pull your current branch? ");
			return;
		}
		// stage and commits current changes to backup branch
		console.log(await this._git.add("."));
		console.log(await this._git.commit(`active-git-backup: backup commit [${randomUUID()}]`));
		// force pushes since we are rewriting git history
		console.log(await this._git.push(this._config.defaultBackupUpstreamName, backupBranchName, ["--force"]));
		// IMPORTANT: the local backup branch is ALWAYS maintained in a state in sync with your local branch
		// 		It is therefore always lagging behind the upstream backup branch.
		console.log(await this._git.reset(["--mixed", "HEAD~1"]));
		console.log(await this._git.checkout(currentBranchName));
	}

	public async loadBackup(branchName?: string): Promise<boolean> {
		if (!this.isEnabled) {
			return false;
		}
		let currentBranchName = await this.getCurrentBranchName(branchName);
		console.log(`Loading Backup for "${currentBranchName}"`);

		if (vscode.workspace.textDocuments.filter(document => document.isDirty).length !== 0) {
			this.showStatusMessage("Load Backup aborted: Detected unsaved changes in your current workspace");
			return false;
		}

		let branchInfo = await this._branchInfo.get(this._config.branchInfoPath, currentBranchName);
		if (branchInfo === undefined) {
			this.showStatusMessage(`Load Backup failed: No backup branch found for "${currentBranchName}"`);
			return false;
		}
		let backupBranchName: string = branchInfo.backupBranchName;
		// stashes the current changes. Normally this shouldn't do anything since you wouldn't want to load backup with local changes
		console.log(await this._git.stash());
		console.log(await this._git.checkout(backupBranchName));
		console.log(await this._git.fetch());
		// pulls in the most up to date backup branch
		console.log(await this._git.reset(["--hard", this._config.defaultBackupUpstreamName + "/" + backupBranchName]));
		// undoes the last commit
		console.log(await this._git.reset(["--mixed", "HEAD~1"]));
		// brings those changes in the last commit over to the current branch
		console.log(await this._git.checkout(currentBranchName));

		return true;
	}
}