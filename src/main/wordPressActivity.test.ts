/**
 * @jest-environment node
 */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { isWordPressInstallingOrUpdating, RECENT_ACTIVITY_MS } from './wordPressActivity';

describe('isWordPressInstallingOrUpdating', () => {
	let webRoot: string;
	let themeFile: string;

	/**
	 * A time far enough after the test files were created that they no longer count as recent
	 */
	const later = () => Date.now() + RECENT_ACTIVITY_MS * 2;

	beforeEach(() => {
		webRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'instant-reload-'));
		themeFile = path.join(webRoot, 'wp-content', 'themes', 'my-theme', 'header.php');
		fs.outputFileSync(themeFile, '<?php');
	});

	afterEach(() => {
		fs.removeSync(webRoot);
	});

	it('treats an edit to an existing theme as a developer change', () => {
		expect(isWordPressInstallingOrUpdating(webRoot, themeFile, later())).toBe(false);
	});

	it('detects a .maintenance file written during updates', () => {
		fs.outputFileSync(path.join(webRoot, '.maintenance'), '<?php $upgrading = time(); ?>');

		expect(isWordPressInstallingOrUpdating(webRoot, themeFile, Date.now())).toBe(true);
	});

	it('ignores a .maintenance file older than WordPress honours', () => {
		fs.outputFileSync(path.join(webRoot, '.maintenance'), '<?php $upgrading = time(); ?>');

		expect(isWordPressInstallingOrUpdating(webRoot, themeFile, Date.now() + 11 * 60 * 1000)).toBe(false);
	});

	it.each(['upgrade', 'upgrade-temp-backup'])('detects recent activity in wp-content/%s', (folderName) => {
		fs.ensureDirSync(path.join(webRoot, 'wp-content', folderName, 'my-theme'));

		// Check from a later time, so only the upgrade folder's touched time can count as recent
		const now = later();
		const recent = new Date(now - 1000);
		fs.utimesSync(path.join(webRoot, 'wp-content', folderName), recent, recent);

		expect(isWordPressInstallingOrUpdating(webRoot, themeFile, now)).toBe(true);
	});

	it('detects a recently changed entry inside an otherwise quiet upgrade folder', () => {
		const entry = path.join(webRoot, 'wp-content', 'upgrade', 'my-theme-abc123');
		fs.ensureDirSync(entry);

		const now = later();
		const old = new Date(now - RECENT_ACTIVITY_MS * 2);
		const recent = new Date(now - 1000);
		fs.utimesSync(path.join(webRoot, 'wp-content', 'upgrade'), old, old);
		fs.utimesSync(entry, recent, recent);

		expect(isWordPressInstallingOrUpdating(webRoot, themeFile, now)).toBe(true);
	});

	it('ignores leftovers in the upgrade folder from an old install', () => {
		const entry = path.join(webRoot, 'wp-content', 'upgrade', 'my-theme-abc123');
		fs.ensureDirSync(entry);

		const now = later();
		const old = new Date(now - RECENT_ACTIVITY_MS * 2);
		fs.utimesSync(entry, old, old);
		fs.utimesSync(path.join(webRoot, 'wp-content', 'upgrade'), old, old);

		expect(isWordPressInstallingOrUpdating(webRoot, themeFile, now)).toBe(false);
	});

	it('detects files in a theme folder that was just created', () => {
		const { birthtimeMs } = fs.statSync(path.dirname(themeFile));

		// Skip on file systems that don't report a creation time
		if (birthtimeMs > 0) {
			expect(isWordPressInstallingOrUpdating(webRoot, themeFile, Date.now())).toBe(true);
		}
	});
});
