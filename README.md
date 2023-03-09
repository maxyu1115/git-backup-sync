# VSCode Git Backup & Sync Extension

Git Backup and Sync is an extension for Visual Studio Code, aiming to provide a way to backup and sync your **work in progress** through the use of git.

This extension fundamentally manages an individual backup branch for branches, pushes your work in progress to the backup branch, but still keeps those changes unstaged on your own branch.

> **Disclaimer: this extension is PRIMARILY designed to be used on feature branches that only one person edits, and while can support a few people, doesn't work well when many people are actively making commits to the remote branch.**

## Use Case 1: Backing up Work In Progress

Currently, when we have work in progress, we generally don't want to commit it to our remote repository to avoid poluting the git history. On the other hand, we want to backup our changes in case of lossing it. With git currently, the best option I know of is to fix the git history eventually with interactive rebases and force pushes. This is always a hassle.

With Git Backup & Sync, after creating a backup branch with `git-backup-sync.createBackupBranch`, whenever you want to make a backup, just run `git-backup-sync.backup`. Or if autobackup is configured, whenever text files are saved, it is automatically backed up. And the biggest benefit is that all your local changes are still uncommitted on your current branch.

## Use Case 2: Syncing WIP across multiple devices

For people working across multiple devices, syncing your work in progress across the devices is also annoying; similar to making backups, yes you can make commits and push, but often times you don't want to polute git history.

With Git Backup & Sync, after creating a backup branch with `git-backup-sync.createBackupBranch`, before switching devices, run `git-backup-sync.backup`, and on your other device, run `git-backup-sync.loadBackup`. Your other device then get's all the uncommitted changes from your first device.

## Features

Git Backup & Sync currently supports the following commands:
- `createBackupBranch`: creates a backup branch for your current branch. Unless overriden, branch `xxx`'s backup branch will be named `gbs-backup-xxx`.
- `backup`: Backups your current branch onto the created backup branch.
- `loadBackup`: Loads your current branch's backup from `origin`. **Note that this stashes your local uncommitted changes**
- `syncBackupBranch`: Syncs your current branch's backup branch to be based off of your current branch. **This is necessary when you committed to your current branch, or pulled in new changes**.
- `retireBackupBranch`: When you no longer want to backup your current branch, removes the backup branch's branch info file entry.

## Extension Settings
This extension contributes the following settings:

* `git-backup-sync.branchInfoPath`: Points to the location of the branch info file. This defaults to `.branchinfo`.
* `git-backup-sync.defaultBackupUpstreamName`: Name of the default upstream name. This defaults to `origin`.
* `git-backup-sync.defaultAutoBackupBranches`: When creating new backup branches, the new backup branch starts off with `autobackup = defaultAutoBackupBranches`. This defaults to `false`.

These settings don't need to be shared and can be different across clones, even including `branchInfoPath`. (But if one wants to sync changes across devices, they need to use the same backup branch. )

## GitHub
The code for this extension is available on github at: https://github.com/maxyu1115/git-backup-sync


## Want to Contribute?
I have already created a few issues. Feel free to grab one, work on it, and make a pull request. If you have other ideas, feel free to start a thread in discussions.