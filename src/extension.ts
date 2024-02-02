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

	var extension = new GitBackupSync(context);

	vscode.workspace.onDidChangeConfiguration(() => {
		extension.reloadConfig();
	});

	vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
		// TODO: do we want to ignore document if it is the branchinfo file?
		let branchName = await extension.getCurrentBranchName();
		let shouldBackup = await extension.shouldAutoBackup(branchName);
		if (shouldBackup) {
			await extension.backup(branchName);
		}
	});

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	extension.showOutputMessage('Congratulations, your extension "git-backup-sync" is now active!');

	context.subscriptions.push(
		vscode.commands.registerCommand('git-backup-sync.createBackupBranch',
			() => extension.createBackupBranch()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('git-backup-sync.retireBackupBranch',
			() => extension.retireBackupBranch()
		)
	);
	
	context.subscriptions.push(
		vscode.commands.registerCommand('git-backup-sync.syncBackupBranch',
			() => extension.syncBackupBranch()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('git-backup-sync.backup',
			() => extension.backup()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('git-backup-sync.loadBackup',
			() => extension.loadBackup()
		)
	);
}

// This method is called when your extension is deactivated
export function deactivate() { }

interface IBranchInfoConfig {
	branchInfoPath: string;
	shouldCommitBranchInfoFile: boolean;
}

interface IConfig {
	backupBranchNamePrefix: string;
	defaultAutoBackupBranches: boolean;
	defaultBackupUpstreamName: string;

	// Configs only present when branchInfo file is enabled
	branchInfoConfig: IBranchInfoConfig | undefined;
}

function parseConfig(): IConfig {
	let branchInfoConfig: IBranchInfoConfig | undefined = undefined;
	if (vscode.workspace.getConfiguration('git-backup-sync').get("branchInfo.enabled") === true) {
		branchInfoConfig = {
			branchInfoPath: <string> vscode.workspace.getConfiguration('git-backup-sync').get("branchInfo.path"),
			shouldCommitBranchInfoFile: <boolean> vscode.workspace.getConfiguration('git-backup-sync').get("branchInfo.shouldCommitBranchInfoFile")
		};
	}
	return {
		backupBranchNamePrefix: <string> vscode.workspace.getConfiguration('git-backup-sync').get("backupBranchNamePrefix"),
		defaultAutoBackupBranches: <boolean> vscode.workspace.getConfiguration('git-backup-sync').get("defaultAutoBackupBranches"),
		defaultBackupUpstreamName: <string> vscode.workspace.getConfiguration('git-backup-sync').get("defaultBackupUpstreamName"),
		branchInfoConfig: branchInfoConfig
	};
}

class GitBackupSync {
	private _outputChannel: vscode.OutputChannel;
	private _context: vscode.ExtensionContext;
	private _config: IConfig;

	private _git: git.SimpleGit;
	private _branchInfo: branchInfo.BranchInfoManager;

	constructor(context: vscode.ExtensionContext) {
		this._context = context;
		this._outputChannel = vscode.window.createOutputChannel('Git Backup & Sync');
		this._config = parseConfig();
		console.log(this._config);

		if (vscode.workspace.workspaceFolders !== undefined) {
			console.log(vscode.workspace.workspaceFolders[0].uri.fsPath);
			this._git = git.simpleGit({ baseDir: vscode.workspace.workspaceFolders[0].uri.fsPath });
			this._branchInfo = new branchInfo.BranchInfoManager(
				vscode.workspace.workspaceFolders[0].uri
			);
		} else {
			throw new Error("Git Backup & Sync: Failed to activate extension, this can only be ran from within a workspace.");
		}
	}

	public get isEnabled(): boolean {
		return !!this._context.globalState.get('isEnabled', true);
	}
	public set isEnabled(value: boolean) {
		this._context.globalState.update('isEnabled', value);
	}

	public reloadConfig(): void {
		let lastDefaultAutoBackup: boolean = this._config.defaultAutoBackupBranches;
		let branchInfoEnabledBefore: boolean = this._config.branchInfoConfig !== undefined;
		// update configs
		this._config = parseConfig();

		let defaultAutoBackup: boolean = this._config.defaultAutoBackupBranches;
		let branchInfoEnabledAfter: boolean = this._config.branchInfoConfig !== undefined;
		if (branchInfoEnabledAfter) {
			let branchInfoPath = (<IBranchInfoConfig> this._config.branchInfoConfig).branchInfoPath;
			if (branchInfoEnabledAfter !== branchInfoEnabledBefore && defaultAutoBackup === lastDefaultAutoBackup) {
				this._branchInfo.updateAutoBackup(branchInfoPath, this._config.defaultAutoBackupBranches);
			} else if (defaultAutoBackup !== lastDefaultAutoBackup) {
				let msg: string = defaultAutoBackup ? "Do you want to auto backup all branches?" : "Do you want to undo auto-backup for all branches?";
				vscode.window.showWarningMessage(msg, "Yes", "No").then(selection => {
					if(selection === 'Yes') {
						//update branchinfo here
						this._branchInfo.updateAutoBackup(branchInfoPath, this._config.defaultAutoBackupBranches);
					}
				});
			}
		}
	}

	/**
	 * Show message in output channel
	 */
	public showOutputMessage(message: string): void {
		console.log(message);
		this._outputChannel.appendLine(message);
	}

	/**
	 * Show message in status bar and output channel.
	 * Return a disposable to remove status bar message.
	 */
	private async showInformationMessage(message: string) {
		this.showOutputMessage(message);
		return await vscode.window.showInformationMessage(message);
	}

	private async showErrorMessage(message: string) {
		this.showOutputMessage(message);
		return await vscode.window.showErrorMessage(message);
	}

	public async getCurrentBranchName(branchName?: string): Promise<string> {
		this.showOutputMessage("Getting current branch name");
		if (branchName !== undefined) {
			return branchName;
		}
		return this._git.branch().then(value => {
			this.showOutputMessage("git current branch is: " + value.current);
			return value.current;
		});
	}

	public async shouldAutoBackup(branchName?: string): Promise<boolean> {
		if (!this.isEnabled) {
			return false;
		}
	
		return this.getCurrentBranchName(branchName).then(currentBranchName => 
			{
				if (this._config.branchInfoConfig === undefined) {
					return this._config.defaultAutoBackupBranches;
				}
				return this._branchInfo.get(this._config.branchInfoConfig.branchInfoPath, currentBranchName).then(v => {
					if (v === undefined) {
						return false;
					}
					return v.autoBackup;
				});
			}
		);
	}

	private async checkBranchesInSync(branchName1: string, branchName2: string, expectedBranch1Ahead: number, expectedBranch2Ahead: number): Promise<boolean> {
		let result = await this._git.raw(["rev-list", "--left-right", "--count", `${branchName1}...${branchName2}`]);
		console.log(result);
		const diffCountParsingRegex = /(\d+)\s+(\d+)/;
		const match = diffCountParsingRegex.exec(result);
		if (match !== null && match.length === 3) {
			const branch1Ahead = parseInt(match[1]);
			const branch2Ahead = parseInt(match[2]);
			return (branch1Ahead === expectedBranch1Ahead) && (branch2Ahead === expectedBranch2Ahead);
		} else {
			this.showErrorMessage(`git rev-list failed, are you using an up-to-date git?`);
			return false;
		}
	}

	private async getBackupBranchName(currentBranchName: string): Promise<string | undefined> {
		if (this._config.branchInfoConfig === undefined) {
			return this._config.backupBranchNamePrefix + currentBranchName;
		}
		return this._branchInfo.getMap(this._config.branchInfoConfig.branchInfoPath).then(branchInfoMap => {
			let backupBranchInfo= branchInfoMap.get(currentBranchName);
			if (backupBranchInfo === undefined) {
				return undefined;
			}
			return backupBranchInfo.backupBranchName;
		});
	}

	public async createBackupBranch(branchName?: string): Promise<string | undefined> {
		if (!this.isEnabled) {
			return;
		}
		let currentBranchName: string = await this.getCurrentBranchName(branchName);
		this.showOutputMessage(`Creating Backup Branch for "${currentBranchName}"`);

		let backupBranchName: string = this._config.backupBranchNamePrefix + currentBranchName;

		if (this._config.branchInfoConfig !== undefined) {
			let branchInfoMap = await this._branchInfo.getMap(this._config.branchInfoConfig.branchInfoPath);

			if (branchInfoMap.has(currentBranchName)) {
				this.showErrorMessage(`Create Backup Branch failed: "${currentBranchName}" already has a backup branch, aborting`);
				return;
			}

			let inputBackupBranchName = await vscode.window.showInputBox({
				placeHolder: "Type a Branch Name, or press ENTER and use the default",
				prompt: "Create Backup Branch with Name"
			});
			if (inputBackupBranchName === undefined) {
				this.showInformationMessage("Create Backup Branch cancelled");
				return;
			}
			backupBranchName = (inputBackupBranchName !== "") ? inputBackupBranchName : backupBranchName;
		}

		let allBranches = (await this._git.branch()).branches;
		let allBranchNames = new Set();
		let remotePrefix = `remotes/${this._config.defaultBackupUpstreamName}/`;
		for (let name in allBranches) {
			if (name.startsWith("remotes/")) {
				// we only need to prevent same names for the desired backup remote+local, other remotes don't matter
				if (name.startsWith(remotePrefix)) {
					allBranchNames.add(name.substring(remotePrefix.length));
				}
			} else {
				allBranchNames.add(name);
			}
		}

		if (allBranchNames.has(backupBranchName)) {
			this.showErrorMessage(`Create Backup Branch failed: intended backup branch name "${backupBranchName}" already exists`);
			return;
		}

		if (this._config.branchInfoConfig !== undefined) {
			await this._branchInfo.update(this._config.branchInfoConfig.branchInfoPath, currentBranchName, {
				autoBackup: this._config.defaultAutoBackupBranches,
				backupBranchName: backupBranchName,
			});
		}
		// unstage current changes
		console.log(await this._git.reset());
		if (this._config.branchInfoConfig !== undefined && this._config.branchInfoConfig.shouldCommitBranchInfoFile) {
			console.log(await this._git.add(this._config.branchInfoConfig.branchInfoPath));
			console.log(await this._git.commit(`git-backup-sync: create backup branch for [${currentBranchName}]`));
		}
		console.log(await this._git.branch([backupBranchName, currentBranchName]));
		return backupBranchName;
	}

	public async retireBackupBranch(branchName?: string): Promise<void> {
		if (!this.isEnabled) {
			return;
		}

		let currentBranchName: string = await this.getCurrentBranchName(branchName);
		this.showOutputMessage(`Retiring Backup Branch for "${currentBranchName}"`);

		let backupBranchName = await this.getBackupBranchName(currentBranchName);
		if (backupBranchName === undefined) {
			this.showErrorMessage(`Retire Backup Branch Aborted: "${currentBranchName}" doesn't have a backup branch, aborting`);
			return;
		}

		if (this._config.branchInfoConfig !== undefined) {
			console.log(await this._branchInfo.delete(this._config.branchInfoConfig.branchInfoPath, currentBranchName));
		}
		console.log(await this._git.deleteLocalBranch(backupBranchName));

		// TODO: undo the "git-backup-sync: create backup branch" commit?
	}

	public async syncBackupBranch(branchName?: string): Promise<string | undefined> {
		if (!this.isEnabled) {
			return;
		}

		let currentBranchName: string = await this.getCurrentBranchName(branchName);
		this.showOutputMessage(`Syncing Backup Branch for "${currentBranchName}"`);

		let backupBranchName = await this.getBackupBranchName(currentBranchName);
		if (backupBranchName === undefined) {
			this.showErrorMessage(`Sync Backup Branch Aborted: "${currentBranchName}" doesn't have a backup branch, aborting`);
			return;
		}

		// by recreating the local backup branch, we make sure the local backup branch is in sync to the local branch
		console.log(await this._git.deleteLocalBranch(backupBranchName));
		console.log(await this._git.branch([backupBranchName, currentBranchName]));
	}

	public async backup(branchName?: string): Promise<void> {
		if (!this.isEnabled) {
			return;
		}
		let currentBranchName = await this.getCurrentBranchName(branchName);
		this.showOutputMessage(`Backing up Current Branch "${currentBranchName}"`);

		let backupBranchName = await this.getBackupBranchName(currentBranchName);
		if (backupBranchName === undefined) {
			this.showErrorMessage("Backup failed: no backup branch found. Please create backup branch first");
			return;
		}

		let failed = false;
		// unstages current changes
		console.log(await this._git.reset());
		try {
			console.log(await this._git.checkout(backupBranchName));
		} catch(exception) {
			console.log(exception);
			// TODO: might want to add an auto refresh backup branch
			this.showErrorMessage("Backup failed during checkout backup branch, backup branch is likely out of sync with your branch "
				 + currentBranchName + ". Did you refresh your backup branch after last commit, or forgot to pull your current branch? ");
			return;
		}
		// stage and commits current changes to backup branch
		console.log(await this._git.add("."));
		try {
			console.log(await this._git.commit(`git-backup-sync: backup commit [${randomUUID()}]`));
		} catch(exception) {
			failed = true;
			console.log(await this._git.reset());
		}
		if (!failed) {
			try {
				// force pushes since we are rewriting git history
				console.log(await this._git.push(this._config.defaultBackupUpstreamName, backupBranchName, ["--force"]));
			} catch(exception) {
				failed = true;
				this.showErrorMessage(`Backup failed: force push to ${this._config.defaultBackupUpstreamName}/${backupBranchName} failed`);
			}
		}
		if (!failed) {
			// IMPORTANT: the local backup branch is ALWAYS maintained in a state in sync with your local branch
			// 		It is therefore always lagging behind the upstream backup branch.
			console.log(await this._git.reset(["--mixed", "HEAD~1"]));
		}
		console.log(await this._git.checkout(currentBranchName));
	}

	public async loadBackup(branchName?: string): Promise<boolean> {
		if (!this.isEnabled) {
			return false;
		}
		let currentBranchName = await this.getCurrentBranchName(branchName);
		this.showOutputMessage(`Loading Backup for "${currentBranchName}"`);

		if (vscode.workspace.textDocuments.filter(document => document.isDirty).length !== 0) {
			this.showErrorMessage("Load Backup aborted: Detected unsaved changes in your current workspace");
			return false;
		}

		let backupBranchName = await this.getBackupBranchName(currentBranchName);
		if (backupBranchName === undefined) {
			///ask user if they want to loadBackup by giving a backup Branch name
			let branchName = await vscode.window.showInputBox({
				placeHolder: 'No backup branch found.Type a Branch Name, or press Esc to cancel',
				ignoreFocusOut: true, // 光标移开也不会消失
				prompt: "Load Backup Branch",
			});

			if (branchName === undefined) {
				this.showErrorMessage(`Load Backup failed: No backup branch found for "${currentBranchName}"`);
				return false;
			}

			backupBranchName = branchName;
		}
		// TODO: add check to confirm branch exists upstream

		// stashes the current changes. Normally this shouldn't do anything since you wouldn't want to load backup with local changes
		console.log(await this._git.stash());
		console.log(await this._git.checkout(backupBranchName));
		console.log(await this._git.fetch());
		// pulls in the most up to date backup branch
		console.log(await this._git.reset(["--hard", this._config.defaultBackupUpstreamName + "/" + backupBranchName]));

		// Check if backup branch is out of sync
		// only acceptable output is "0 1", where backup branch is ahead by only 1 commit; which is the backup commit
		let checkResult = await this.checkBranchesInSync(currentBranchName, backupBranchName, 0, 1);
		if (checkResult === false) {
			// switch back to current branch temporarily, in case user ignores UI
			console.log(await this._git.checkout(currentBranchName));
			let selection = await vscode.window.showWarningMessage(`"${backupBranchName}" is out of sync with your local branch. Do you still want to continue Loading Backup?`, "Yes", "No");
			// continue only if the user insists
			if (selection !== "Yes") {
				return false;
			}
			// switch back to backup branch to load backup
			console.log(await this._git.checkout(backupBranchName));
		}

		// undoes the last commit
		console.log(await this._git.reset(["--mixed", "HEAD~1"]));
		// brings those changes in the last commit over to the current branch
		console.log(await this._git.checkout(currentBranchName));

		return true;
	}
}