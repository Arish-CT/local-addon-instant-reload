import path from 'path';
import fs from 'fs';

/**
 * How long after WordPress touches its upgrade folders, or creates a theme folder, file changes are treated as
 * part of an install or update rather than an edit made by the developer.
 */
export const RECENT_ACTIVITY_MS = 30 * 1000;

/**
 * WordPress ignores a .maintenance file that is older than 10 minutes (see wp_is_maintenance_mode()).
 */
const MAINTENANCE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Folders WordPress unpacks packages into and moves the previous version of a plugin or theme to
 * while it installs or updates them.
 */
const UPGRADE_FOLDERS = [
	'upgrade',
	'upgrade-temp-backup',
];

function statOrNull (filePath: string): fs.Stats | null {
	try {
		return fs.statSync(filePath);
	} catch (err) {
		return null;
	}
}

/**
 * WordPress writes a .maintenance file to the web root while it updates core, plugins or themes
 */
function isInMaintenanceMode (webRoot: string, now: number): boolean {
	const stats = statOrNull(path.join(webRoot, '.maintenance'));

	return !!stats && now - stats.mtimeMs < MAINTENANCE_MAX_AGE_MS;
}

/**
 * A folder's modified time changes whenever an entry is added to or removed from it, so a recently modified
 * upgrade folder (or entry inside it) means WordPress has just unpacked, moved or cleaned up a package.
 */
function hasRecentUpgradeActivity (webRoot: string, now: number): boolean {
	return UPGRADE_FOLDERS.some((folderName) => {
		const folderPath = path.join(webRoot, 'wp-content', folderName);
		const folderStats = statOrNull(folderPath);

		if (!folderStats) {
			return false;
		}

		if (now - folderStats.mtimeMs < RECENT_ACTIVITY_MS) {
			return true;
		}

		let entries: string[] = [];

		try {
			entries = fs.readdirSync(folderPath);
		} catch (err) {
			return false;
		}

		return entries.some((entry) => {
			const entryStats = statOrNull(path.join(folderPath, entry));

			return !!entryStats && now - entryStats.mtimeMs < RECENT_ACTIVITY_MS;
		});
	});
}

/**
 * Installing a theme, or updating one, puts a freshly created folder in place of the old one.
 * Some file systems don't report a creation time, in which case birthtimeMs is 0 and this check is skipped.
 */
function isNewThemeFolder (webRoot: string, file: string, now: number): boolean {
	const themesPath = path.join(webRoot, 'wp-content', 'themes');
	const [themeFolderName] = path.relative(themesPath, path.normalize(file)).split(path.sep);

	if (!themeFolderName || themeFolderName === '..') {
		return false;
	}

	const stats = statOrNull(path.join(themesPath, themeFolderName));

	return !!stats && stats.birthtimeMs > 0 && now - stats.birthtimeMs < RECENT_ACTIVITY_MS;
}

/**
 * Whether a changed theme file was most likely written by WordPress installing or updating core, a plugin or a
 * theme (from wp-admin, WP-CLI or an auto-update) instead of by the developer editing it.
 *
 * @param webRoot string the site's web root
 * @param file string the changed file
 * @param now number current time in milliseconds
 */
export function isWordPressInstallingOrUpdating (webRoot: string, file: string, now: number = Date.now()): boolean {
	return isInMaintenanceMode(webRoot, now)
		|| hasRecentUpgradeActivity(webRoot, now)
		|| isNewThemeFolder(webRoot, file, now);
}
