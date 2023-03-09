# Change Log
## [0.2.0] - 2023-03-08

### Changed
- Changed extension name from `active-git-backup` to `git-backup-sync`
- Adjusted notification display, now has pop up windows

### Added
- Ability for user to specify a branch name for `createBackupBranch`. Pressing Enter results in the default

## [0.1.0] - 2023-03-07

First release : D

### Added
The following commands:
- `createBackupBranch`
- `retireBackupBranch`
- `syncBackupBranch`
- `backup`
- `loadBackup`

And the following configs:
- `branchInfoPath`
- `defaultAutoBackupBranches`
- `defaultBackupUpstreamName`
- `shouldCommitBranchInfoFile`