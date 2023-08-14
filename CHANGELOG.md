# Change Log

## [0.3.0] - 2023-08-13

### Changed
- Added safeguard for calling `loadBackup` when branch is out of sync
- When calling `loadBackup` when no backup branch is found, ask user to specify a backup branch
- Added a warning window where users can choose to toggle auto-backup setting for all previously backed-up branches when they change the `defaultAutoBackupBranches`` config value

### Added
- `defaultBackupBranchNamePrefix` config to configure the default backup branch name
- Icon for the extension

### Fixed
- `createBackupBranch` now checks for branch names in use



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