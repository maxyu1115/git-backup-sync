# VSCode Active Git Backup Extension

Active Git Backup is an extension for Visual Studio Code, aiming to provide a way to actively backup your work in progress through the use of git.

This extension fundamentally manages an individual backup branch for branches, pushes your work in progress to the backup branch, but still keeps those changes unstaged on your own branch.

### Use Case 1: Backing up WIP

Currently, when we have work in progress, we generally don't want to commit it to our remote repository to avoid poluting the git history. On the other hand, we want to backup our changes in case of lossing it. With git currently, the best option I know of is to fix the git history eventually with interactive rebases and force pushes. This is always a hassle.

With Active Git Backup, after creating a backup branch, whenever you want to make a backup, just run `active-git-backup.backup`. Or if autobackup is configured, whenever text files are saved, it is automatically backed up. And the biggest benefit is that all your local changes are still uncommitted on your current branch.

### Use Case 2: Syncing WIP across multiple devices
> Disclaimer: this use case doesn't work well when many people are actively making commits to the remote branch.

For people working across multiple devices, syncing your work in progress across the devices is also annoying; similar to making backups, yes you can make commits and push, but often times you don't want to polute git history.

With Active Git Backup, after creating a backup branch, before switching devices, run `active-git-backup.backup`, and on your other device, run `active-git-backup.loadBackup`. Your other device then get's all the uncommitted changes from your first device.

## Features

Active Git Backup currently supports the following commands:
- `createBackupBranch`: creates a backup branch for your current branch. Unless overriden, branch `xxx`'s backup branch will be named `agb-backup-xxx`.
- `backup`: Backups your currently branch onto the created backup branch.
- `loadBackup`: Loads the your current branch's backup from `origin`. **Note that this stashes your local uncommitted changes**
- `syncBackupBranch`: Syncs your current branch's backup branch to be based off of your current branch. **This is necessary when you committed to your current branch, or pulled in new changes**.
- `retireBackupBranch`: When you no longer want to backup your current branch, removes the backup branch's agb file entry.

## Extension Settings
This extension contributes the following settings:

* `active-git-backup.branchInfoPath`: Points to the location of the branch info file. This defaults to `.agbbinfo`.
* `active-git-backup.defaultAutoBackupBranches`: When creating new backup branches, the new backup branch starts off with `autobackup = defaultAutoBackupBranches`. This defaults to `false`.

## GitHub
The code for this extension is available on github at: https://github.com/maxyu1115/active-git-backup
