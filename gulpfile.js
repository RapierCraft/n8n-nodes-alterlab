const { src, dest } = require('gulp');

function buildIcons() {
	return src('nodes/**/*.svg').pipe(dest('dist/nodes/'));
}

function buildJson() {
	return src('nodes/**/*.json').pipe(dest('dist/nodes/'));
}

exports['build:icons'] = async function () {
	await Promise.all([
		new Promise((resolve, reject) => buildIcons().on('end', resolve).on('error', reject)),
		new Promise((resolve, reject) => buildJson().on('end', resolve).on('error', reject)),
	]);
};
