import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
	{
		ignores: ["legacy/**"],
	},
	...nextVitals,
];

export default config;
