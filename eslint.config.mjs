import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
	{
		ignores: [
			"legacy/**",
			"app.js",
			"app-src.js",
			"core.js",
			"core-src.js",
			"core-readable.js",
			"sw.js",
			".next/**",
		],
	},
	...nextVitals,
];

export default config;
